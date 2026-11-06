import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ExecutionPlanSchema } from './executionPlan';
import type { TestSuiteManifest } from './testManifest';
import { writeProtocolJson } from './json';
import { BuildIdentitySchema, CommitSchema } from './schema';
import { repositoryEnvironment } from './identity';

const engines = ['chromium', 'firefox', 'webkit'] as const;
const exec = promisify(execFile);
type Engine = (typeof engines)[number];
type FailureKind =
  | 'failed'
  | 'timedOut'
  | 'interrupted'
  | 'skipped'
  | 'unexpected-result'
  | 'collection-error'
  | 'report-invalid'
  | 'report-unavailable';
interface Failure {
  testName: string;
  engine: Engine;
  location: { file: string; line: number; column: number } | null;
  kind: FailureKind;
}
interface FailureSummary {
  schemaVersion: 1;
  failures: Failure[];
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function isEngine(value: string): value is Engine {
  return engines.some((engine) => engine === value);
}
function collection(engine: Engine, kind: FailureKind): FailureSummary {
  return { schemaVersion: 1, failures: [{ testName: 'collection', engine, location: null, kind }] };
}
function location(
  root: string,
  suite: string,
  spec: Record<string, unknown>,
  allowedFiles: ReadonlySet<string>,
): Failure['location'] {
  const { file, line, column } = spec;
  if (
    typeof file !== 'string' ||
    file.includes('\\') ||
    file.length > 300 ||
    typeof line !== 'number' ||
    !Number.isSafeInteger(line) ||
    line < 1 ||
    line > 1_000_000 ||
    typeof column !== 'number' ||
    !Number.isSafeInteger(column) ||
    column < 1 ||
    column > 1_000_000
  )
    return null;
  const relative = path.isAbsolute(file)
    ? path.relative(root, file)
    : file.startsWith('tests/')
      ? file
      : (suite.startsWith('native-learning-') ? 'tests/local/' : 'tests/e2e/') + file;
  if (!allowedFiles.has(relative)) return null;
  return { file: relative, line, column };
}

/** Only paths present as regular test blobs in the frozen candidate commit may be displayed. */
async function frozenTestFiles(root: string, sourceCommit: string): Promise<ReadonlySet<string>> {
  try {
    const commit = CommitSchema.parse(sourceCommit);
    const { stdout } = await exec(
      'git',
      ['ls-tree', '-r', '-z', commit, '--', 'tests/local', 'tests/e2e'],
      {
        cwd: root,
        env: await repositoryEnvironment(root),
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return new Set(
      stdout.split('\0').flatMap((row) => {
        if (!/^100(?:644|755) blob [a-f0-9]{40}\t/u.test(row)) return [];
        const file = row.slice(row.indexOf('\t') + 1);
        return /^tests\/(?:local|e2e)\/[A-Za-z0-9_./-]+\.[cm]?[jt]sx?$/u.test(file) ? [file] : [];
      }),
    );
  } catch {
    return new Set();
  }
}
function testName(entry: TestSuiteManifest['tests'][number]): string {
  const lesson = entry.lessonKeys?.length === 1 ? entry.lessonKeys[0] : undefined;
  if (lesson && lesson.length <= 200 && /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u.test(lesson))
    return lesson + ' actual learning UI';
  return /^[A-Za-z0-9_-]{1,200}\/(?:chromium|firefox|webkit)$/u.test(entry.key)
    ? entry.key
    : 'collection';
}

/** Diagnostic projection only. Names come from frozen IDs; no reporter text or error object is copied. */
function summarize(
  report: unknown,
  root: string,
  manifest: TestSuiteManifest,
  allowedFiles: ReadonlySet<string>,
): FailureSummary {
  if (!isEngine(manifest.project)) throw new Error('Unsupported diagnostic engine');
  const engine = manifest.project;
  const top = object(report);
  if (!top || !Array.isArray(top.suites)) return collection(engine, 'report-invalid');
  if (Array.isArray(top.errors) && top.errors.length) return collection(engine, 'collection-error');
  const failures: Failure[] = [];
  const seen = new Set<string>();
  let visited = 0;
  function visit(value: unknown, depth: number): boolean {
    if (++visited > 10_000 || depth > 16 || failures.length > 100) {
      return false;
    }
    const suite = object(value);
    if (!suite) {
      return false;
    }
    const specs = suite.specs ?? [];
    const nested = suite.suites ?? [];
    if (!Array.isArray(specs) || !Array.isArray(nested)) {
      return false;
    }
    for (const value of specs) {
      const spec = object(value);
      if (!spec || typeof spec.id !== 'string' || !Array.isArray(spec.tests)) {
        return false;
      }
      const id = spec.id;
      const entry = manifest.tests.find((item) => item.key === id + '/' + engine);
      if (!entry) {
        return false;
      }
      for (const value of spec.tests) {
        const test = object(value);
        if (!test) {
          return false;
        }
        if (seen.has(entry.key)) {
          return false;
        }
        seen.add(entry.key);
        const results = Array.isArray(test.results) ? test.results : [];
        const result = results.length === 1 ? object(results[0]) : undefined;
        const validProject = test.projectName === engine && test.expectedStatus === 'passed';
        if (
          validProject &&
          test.status === 'expected' &&
          result?.status === 'passed' &&
          result.retry === 0
        )
          continue;
        const status = result?.status;
        const kind: FailureKind = !validProject
          ? 'report-invalid'
          : status === 'failed' || status === 'timedOut' || status === 'interrupted'
            ? status
            : test.status === 'skipped' || status === 'skipped'
              ? 'skipped'
              : 'unexpected-result';
        failures.push({
          testName: testName(entry),
          engine,
          location: location(root, manifest.suite, spec, allowedFiles),
          kind,
        });
        if (failures.length > 100) {
          return false;
        }
      }
    }
    for (const child of nested) {
      if (!visit(child, depth + 1)) return false;
    }
    return true;
  }
  for (const suite of top.suites) {
    if (!visit(suite, 0)) return collection(engine, 'report-invalid');
  }
  return !visited || manifest.tests.some((entry) => !seen.has(entry.key))
    ? collection(engine, 'report-invalid')
    : { schemaVersion: 1, failures };
}

async function boundedBytes(file: string): Promise<Buffer> {
  const info = await lstat(file);
  if (!info.isFile() || info.size > 32 * 1024 * 1024)
    throw new Error('Diagnostic input unavailable');
  return readFile(file);
}
async function boundedJson(file: string): Promise<unknown> {
  return JSON.parse((await boundedBytes(file)).toString('utf8')) as unknown;
}

/** A separate bounded diagnostic file is never a suite result, receipt or coverage input. */
export async function writeFailureDiagnostic(
  root: string,
  suite: string,
  reportFile: string,
  manifest: TestSuiteManifest,
  sourceCommit: string,
): Promise<FailureSummary> {
  if (
    !/^[a-z][a-z0-9-]{0,79}$/u.test(suite) ||
    !isEngine(manifest.project) ||
    manifest.suite !== suite
  )
    throw new Error('Unsupported diagnostic context');
  let report: unknown;
  let available = true;
  try {
    report = await boundedJson(reportFile);
  } catch {
    available = false;
  }
  const summary = available
    ? summarize(report, root, manifest, await frozenTestFiles(root, sourceCommit))
    : collection(manifest.project, 'report-unavailable');
  await writeProtocolJson(
    path.join(root, '.release-v2/checks', suite + '-failure-summary.json'),
    summary,
  );
  return summary;
}

/** The release CLI has always failed with exit1. Preserve a child exit code without its captured data. */
export function safeVerificationFailure(error: unknown): Error {
  const result = new Error('Release verification command failed');
  const code = object(error)?.code;
  if (typeof code === 'number' && Number.isSafeInteger(code) && code !== 0)
    Object.assign(result, { code });
  return result;
}

async function summarizeNativeFailures(root: string): Promise<void> {
  const execution = ExecutionPlanSchema.parse(
    await boundedJson(path.join(root, '.release-v2/execution-plan.json')),
  );
  const candidate = BuildIdentitySchema.parse(
    await boundedJson(path.join(root, '.release-v2/candidate.json')),
  );
  for (const engine of engines) {
    const suite = 'native-learning-' + engine;
    const reportFile = path.join(root, '.release-v2/native-learning-reports', suite + '.json');
    try {
      await lstat(reportFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const manifest = execution.testManifests.find((item) => item.suite === suite);
    if (!manifest || manifest.project !== engine)
      throw new Error('Native diagnostic context missing');
    const output = path.join(root, '.release-v2/checks', suite + '-failure-summary.json');
    let summary: FailureSummary;
    try {
      summary = await writeFailureDiagnostic(
        root,
        suite,
        reportFile,
        manifest,
        candidate.recipe.sourceCommit,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // observe-native may already have persisted this exact safe projection.
      let report: unknown;
      try {
        report = await boundedJson(reportFile);
      } catch {
        report = undefined;
      }
      const expected =
        report === undefined
          ? collection(engine, 'report-unavailable')
          : summarize(
              report,
              root,
              manifest,
              await frozenTestFiles(root, candidate.recipe.sourceCommit),
            );
      const expectedBytes = Buffer.from(JSON.stringify(expected, null, 2) + '\n');
      if (!(await boundedBytes(output)).equals(expectedBytes)) throw error;
      summary = expected;
    }
    process.stdout.write(JSON.stringify(summary) + '\n');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  summarizeNativeFailures(process.cwd()).catch(() => {
    process.stderr.write('Native failure diagnostics unavailable\n');
    process.exitCode = 1;
  });
}
