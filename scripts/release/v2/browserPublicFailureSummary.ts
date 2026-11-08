import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { writeProtocolJson } from './json';
import { TestSuiteManifestSchema } from './testManifest';

const suiteName = 'browser-public';
const engine = 'chromium';
const specName = 'manifest-progress-roundtrip.spec.ts';
const specFile = 'tests/e2e/' + specName;
const maxInputBytes = 16 * 1024 * 1024;
const maxEntries = 1000;
const positiveInteger = z.number().int().min(1).max(1_000_000);
const reportSchema = z.object({
  errors: z.array(z.unknown()).default([]),
  suites: z.array(z.unknown()),
});
const suiteSchema = z.object({
  specs: z.array(z.unknown()).default([]),
  suites: z.array(z.unknown()).default([]),
});
const specSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/u),
  file: z.unknown(),
  line: z.unknown(),
  column: z.unknown(),
  tests: z.tuple([
    z.object({
      projectName: z.literal(engine),
      expectedStatus: z.enum(['passed', 'failed', 'skipped']),
      status: z.string(),
      results: z.array(z.object({ status: z.string(), retry: z.literal(0) })).max(1),
    }),
  ]),
});
const metadataSchema = z.object({
  testManifests: z.array(z.object({ suite: z.string() }).passthrough()),
});

interface Location {
  file: string;
  line: number;
  column: number;
}

type Failure =
  | { kind: 'report-unavailable' | 'report-invalid' | 'report-error' | 'verification-failed' }
  | {
      testId: string;
      kind: 'failed' | 'timedOut' | 'interrupted' | 'skipped' | 'unexpected-result';
      location: Location | null;
    };

function summary(failures: Failure[]) {
  return { schemaVersion: 1, engine, failures };
}

function approvedLocation(root: string, spec: z.infer<typeof specSchema>): Location | null {
  const { file, line, column } = spec;
  if (file !== specName && file !== specFile && file !== path.join(root, specFile)) return null;
  const location = z.object({ line: positiveInteger, column: positiveInteger }).safeParse({
    line,
    column,
  });
  return location.success ? { file: specFile, ...location.data } : null;
}

/** 許可した固定manifestのIDと位置だけを診断に残す。受入判定には使用しない。 */
export function summarizeBrowserPublicFailures(
  reportInput: unknown,
  manifestInput: unknown,
  root: string,
) {
  const invalid = () => summary([{ kind: 'report-invalid' }]);
  const report = reportSchema.safeParse(reportInput);
  const manifest = TestSuiteManifestSchema.safeParse(manifestInput);
  if (!report.success || !manifest.success) return invalid();
  const { suite, producerJobId, project, tests } = manifest.data;
  if (
    suite !== suiteName ||
    producerJobId !== 'public_boundary' ||
    project !== engine ||
    tests.length > maxEntries
  )
    return invalid();

  const unseen = new Set(tests.map(({ key }) => key));
  if (unseen.size !== tests.length) return invalid();
  if (report.data.suites.length > maxEntries) return invalid();
  const pending = report.data.suites.toReversed();
  const reportError = report.data.errors.length > 0;
  const failures: Failure[] = reportError ? [{ kind: 'report-error' }] : [];
  let suiteCount = 0;
  while (pending.length > 0) {
    const group = suiteSchema.safeParse(pending.pop());
    suiteCount += 1;
    if (
      !group.success ||
      group.data.specs.length > unseen.size ||
      group.data.suites.length > maxEntries - suiteCount - pending.length
    )
      return invalid();
    for (const input of group.data.specs) {
      const spec = specSchema.safeParse(input);
      if (!spec.success || !unseen.delete(spec.data.id + '/' + engine)) return invalid();
      const [test] = spec.data.tests;
      const status = test.results[0]?.status;
      if (status === 'passed' && test.expectedStatus === 'passed' && test.status === 'expected')
        continue;
      const kind =
        status === 'failed' || status === 'timedOut' || status === 'interrupted'
          ? status
          : status === 'skipped' || test.status === 'skipped'
            ? 'skipped'
            : 'unexpected-result';
      failures.push({
        testId: spec.data.id,
        kind,
        location: approvedLocation(root, spec.data),
      });
    }
    for (const child of group.data.suites.toReversed()) pending.push(child);
  }
  if (unseen.size > 0 && !reportError) return invalid();
  return summary(failures.length ? failures : [{ kind: 'verification-failed' }]);
}

async function boundedJson(file: string): Promise<unknown> {
  const info = await lstat(file);
  if (!info.isFile() || info.size > maxInputBytes) throw new Error('Unavailable summary input');
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

export async function writeBrowserPublicFailureSummary(root: string): Promise<void> {
  const release = path.join(root, '.release-v2');
  const checks = path.join(release, 'checks');
  const metadata = metadataSchema.parse(
    await boundedJson(path.join(release, 'execution-plan.json')),
  );
  const manifests = metadata.testManifests.filter(({ suite }) => suite === suiteName);
  if (manifests.length !== 1) throw new Error('Unavailable public suite manifest');

  const result = await boundedJson(path.join(checks, suiteName + '.json')).then(
    (report) => summarizeBrowserPublicFailures(report, manifests[0], root),
    (error: unknown) =>
      summary([{ kind: error instanceof SyntaxError ? 'report-invalid' : 'report-unavailable' }]),
  );
  await writeProtocolJson(path.join(checks, suiteName + '-failure-summary.json'), result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  writeBrowserPublicFailureSummary(process.cwd()).catch(() => {
    process.stderr.write('browser-public failure summary unavailable\n');
    process.exitCode = 1;
  });
}
