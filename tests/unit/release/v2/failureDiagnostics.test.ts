// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InventorySchema } from '../../../../scripts/release/v2/schema';
import { hashArtifact, hashValue } from '../../../../scripts/release/v2/identity';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { runReleaseSuite } from '../../../../scripts/release/v2/runner';
import type * as CandidateModule from '../../../../scripts/release/v2/candidate';
import { gitFixtureEnvironment } from './gitFixture';

const recipe = vi.hoisted(() => ({
  sourceCommit: '3'.repeat(40),
  sourceTree: '4'.repeat(40),
  lockDigest: 'e'.repeat(64),
  workflowDigest: 'f'.repeat(64),
  policyDigest: '1'.repeat(64),
  toolchain: 'fixed',
  basePath: '/site/',
}));

// Source/Git recipe lookup is outside this test's failure-report boundary.
// Bundle validation, artifact verification, the driver and receipt checks remain real.
vi.mock('../../../../scripts/release/v2/candidate', async (importOriginal) => ({
  ...(await importOriginal<typeof CandidateModule>()),
  readRecipe: async () => recipe,
}));

const roots: string[] = [];
const secret = 'PRIVATE_SOURCE_INPUT_HEADER_DO_NOT_EMIT';
const nativeSuite = 'native-learning-chromium';
const testFile = 'tests/local/manifest-next-learning.spec.ts';
const exec = promisify(execFile);

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function failedReport(root: string, status: 'failed' | 'timedOut' | 'interrupted') {
  return {
    config: { rootDir: path.join(root, 'tests/local'), metadata: { secret } },
    errors: [],
    stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0 },
    suites: [
      {
        title: secret,
        file: path.join(root, testFile),
        suites: [
          {
            title: secret,
            specs: [
              {
                id: 'inventory',
                title: 'manifest learning inventory matches this execution capability',
                file: path.join(root, testFile),
                line: 129,
                column: 3,
                tests: [
                  {
                    projectName: 'chromium',
                    expectedStatus: 'passed',
                    status: 'expected',
                    annotations: [],
                    results: [{ status: 'passed', retry: 0 }],
                  },
                ],
              },
              {
                id: 'lesson-case',
                title: secret,
                file: path.join(root, testFile),
                line: 143,
                column: 5,
                tests: [
                  {
                    projectName: 'chromium',
                    expectedStatus: 'passed',
                    status: 'unexpected',
                    annotations: [
                      { type: 'release-lesson', description: 'topic/lesson' },
                      { type: 'private', description: secret },
                    ],
                    results: [
                      {
                        status,
                        retry: 0,
                        error: {
                          message: secret,
                          stack: secret,
                          snippet: secret,
                          location: { file: '/private/' + secret, line: 1, column: 1 },
                        },
                        errors: [{ message: secret }],
                        stdout: [{ text: secret }],
                        stderr: [{ text: secret }],
                        attachments: [{ name: secret, body: secret, path: '/private/' + secret }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

async function prepare(suite = nativeSuite) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-failure-'));
  roots.push(root);
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), '<p>fixed public candidate</p>');
  await mkdir(path.dirname(path.join(root, testFile)), { recursive: true });
  await writeFile(path.join(root, testFile), '// fixed test source location\n'.repeat(143));
  const gitOptions = { env: gitFixtureEnvironment() };
  await exec('git', ['init', '--quiet', root], gitOptions);
  await exec('git', ['-C', root, 'add', '--', testFile], gitOptions);
  await exec(
    'git',
    [
      '-C',
      root,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'frozen diagnostic test source',
    ],
    gitOptions,
  );
  recipe.sourceCommit = (
    await exec('git', ['-C', root, 'rev-parse', 'HEAD'], gitOptions)
  ).stdout.trim();
  recipe.sourceTree = (
    await exec('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], gitOptions)
  ).stdout.trim();
  const inventory = InventorySchema.parse({
    schemaVersion: 1,
    fingerprintVersion: 1,
    courses: [
      {
        id: 'topic',
        revision: '1',
        publicationStatus: 'published',
        runner: 'html-css',
        lessons: [
          {
            id: 'lesson',
            kind: 'standard',
            learnerDigest: 'a'.repeat(64),
            exerciseDigest: 'b'.repeat(64),
            navigationDigest: 'c'.repeat(64),
            persistenceDigest: 'd'.repeat(64),
            exercises: [],
          },
        ],
      },
    ],
  });
  const proof = {
    schemaVersion: 1,
    repository: 'owner/site',
    deploymentId: '501',
    sourceCommit: '1'.repeat(40),
    workflowHeadCommit: '2'.repeat(40),
    runId: '500',
    tag: 'refs/tags/tsumucode-release-1',
    tagDigest: 'a'.repeat(64),
    artifactDigest: 'b'.repeat(64),
    artifactDigestFormat: 'legacy-canonical-dist',
    projection: 'authoring',
    inventoryDigest: hashValue(inventory),
    publicContentDigest: 'c'.repeat(64),
    publicFiles: 1,
    observedAt: '2026-10-28T10:00:00Z',
  };
  const baseline = {
    deploymentId: '501',
    sourceCommit: proof.sourceCommit,
    artifactDigest: proof.artifactDigest,
    sourceRecordDigest: hashValue(proof),
    inventory,
  };
  const plan = planRelease(inventory, baseline);
  const manifests = TEST_SUITES.map((row) => ({
    suite: row.suite,
    producerJobId: row.producerJobId,
    project: row.project,
    tests:
      row.suite === suite
        ? [
            { key: 'inventory/' + row.project, exerciseIds: [] },
            {
              key: 'lesson-case/' + row.project,
              exerciseIds: [],
              lessonKeys: ['topic/lesson'],
            },
          ]
        : [{ key: 'case-' + row.suite + '/' + row.project, exerciseIds: [] }],
  }));
  const publicContent = await hashArtifact(path.join(root, 'dist'));
  const executionPlan = createExecutionPlan(plan, manifests, hashValue(publicContent));
  const candidate = {
    schemaVersion: 1,
    repository: 'owner/site',
    runId: '101',
    buildJobId: 'build',
    buildAttempt: 1,
    artifactDigest: publicContent.digest,
    artifactId: '301',
    planDigest: hashValue({ plan, executionPlan }),
    recipe,
  };
  await mkdir(path.join(root, '.release-v2/native-learning-reports'), { recursive: true });
  for (const [name, value] of Object.entries({
    preparation: { schemaVersion: 1, inventory, plan, publicContent },
    'execution-plan': executionPlan,
    candidate,
    baseline: { baseline, proof },
  }))
    await writeFile(path.join(root, '.release-v2', name + '.json'), JSON.stringify(value));
  const environment = {
    ...process.env,
    GITHUB_REPOSITORY: 'owner/site',
    GITHUB_RUN_ID: '101',
    GITHUB_JOB: suite === nativeSuite ? 'boundary' : 'browser',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: recipe.sourceCommit,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
  };
  const diagnostic = path.join(root, '.release-v2/checks', suite + '-failure-summary.json');
  return { root, environment, diagnostic };
}

describe('bounded release failure diagnostics', () => {
  it('isolates diagnostic fixture Git operations from inherited worktree selectors', async () => {
    const foreign = await mkdtemp(path.join(os.tmpdir(), 'release-foreign-git-'));
    roots.push(foreign);
    const git = (...args: string[]) =>
      exec('git', ['-C', foreign, ...args], { env: gitFixtureEnvironment() });
    await git('init', '--quiet');
    await mkdir(path.dirname(path.join(foreign, testFile)), { recursive: true });
    await writeFile(path.join(foreign, testFile), '// isolated surrounding worktree\n');
    await git('add', '--', testFile);
    await git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'surrounding source',
    );
    const before = (await git('rev-parse', 'HEAD')).stdout;
    vi.stubEnv('GIT_DIR', path.join(foreign, '.git'));
    vi.stubEnv('GIT_WORK_TREE', foreign);
    const { root } = await prepare();
    await expect(readFile(path.join(root, '.git/HEAD'), 'utf8')).resolves.toContain('refs/heads/');
    expect((await git('rev-parse', 'HEAD')).stdout).toBe(before);
    expect((await git('status', '--porcelain')).stdout).toBe('');
  });
  it.each(['failed', 'timedOut', 'interrupted'] as const)(
    'preserves %s as a diagnostic without turning the Native failure into a receipt',
    async (status) => {
      const { root, environment, diagnostic } = await prepare();
      await writeFile(
        path.join(root, '.release-v2/native-learning-reports', nativeSuite + '.json'),
        JSON.stringify(failedReport(root, status)),
      );
      await expect(runReleaseSuite(root, nativeSuite, environment, true)).rejects.toThrow();
      expect(JSON.parse(await readFile(diagnostic, 'utf8'))).toEqual({
        schemaVersion: 1,
        failures: [
          {
            testName: 'topic/lesson actual learning UI',
            engine: 'chromium',
            location: { file: testFile, line: 143, column: 5 },
            kind: status,
          },
        ],
      });
      await expect(
        readFile(path.join(root, '.release-v2/reports', nativeSuite + '-1.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('never publishes report text, attachments, an untrusted location or an unrecognized engine', async () => {
    const { root, environment, diagnostic } = await prepare();
    const report = failedReport(root, 'failed');
    const spec = report.suites[0]!.suites[0]!.specs[1]!;
    spec.file = '/private/' + secret;
    spec.tests[0]!.projectName = secret;
    await writeFile(
      path.join(root, '.release-v2/native-learning-reports', nativeSuite + '.json'),
      JSON.stringify(report),
    );
    await expect(runReleaseSuite(root, nativeSuite, environment, true)).rejects.toThrow();
    const text = await readFile(diagnostic, 'utf8');
    expect(text).not.toContain(secret);
    expect(text).not.toContain(root);
    expect(text).not.toContain('/private/');
    expect(JSON.parse(text)).toEqual({
      schemaVersion: 1,
      failures: [
        {
          testName: 'topic/lesson actual learning UI',
          engine: 'chromium',
          location: null,
          kind: 'report-invalid',
        },
      ],
    });
  });

  it.each(['relative', 'absolute'] as const)(
    'does not publish an untracked secret-bearing test path even when it is %s and exists',
    async (form) => {
      const { root, environment, diagnostic } = await prepare();
      const report = failedReport(root, 'failed');
      const file = 'tests/local/' + secret + '.spec.ts';
      await writeFile(path.join(root, file), '// present, but not a frozen Source test\n');
      report.suites[0]!.suites[0]!.specs[1]!.file =
        form === 'relative' ? file : path.join(root, file);
      await writeFile(
        path.join(root, '.release-v2/native-learning-reports', nativeSuite + '.json'),
        JSON.stringify(report),
      );
      await expect(runReleaseSuite(root, nativeSuite, environment, true)).rejects.toThrow();
      const text = await readFile(diagnostic, 'utf8');
      expect(text).not.toContain(secret);
      expect(text).not.toContain(root);
      expect(JSON.parse(text)).toEqual({
        schemaVersion: 1,
        failures: [
          {
            testName: 'topic/lesson actual learning UI',
            engine: 'chromium',
            location: null,
            kind: 'failed',
          },
        ],
      });
    },
  );

  it.each([false, true])(
    'reuses only exact safe diagnostic bytes, rejecting a duplicate-key secret=%s',
    async (duplicate) => {
      const { root, diagnostic } = await prepare();
      await writeFile(
        path.join(root, '.release-v2/native-learning-reports', nativeSuite + '.json'),
        JSON.stringify(failedReport(root, 'failed')),
      );
      const expected = {
        schemaVersion: 1,
        failures: [
          {
            testName: 'topic/lesson actual learning UI',
            engine: 'chromium',
            location: { file: testFile, line: 143, column: 5 },
            kind: 'failed',
          },
        ],
      };
      const original = duplicate
        ? '{"schemaVersion":' +
          JSON.stringify(secret) +
          ',"schemaVersion":1,"failures":' +
          JSON.stringify(expected.failures) +
          '}\n'
        : JSON.stringify(expected, null, 2) + '\n';
      await mkdir(path.dirname(diagnostic), { recursive: true });
      await writeFile(diagnostic, original);
      const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
      const result = await exec(
        process.execPath,
        ['--import', loader, path.resolve('scripts/release/v2/failureDiagnostics.ts')],
        { cwd: root, timeout: 15000 },
      ).then(
        ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
        (value: unknown) => {
          const error = value as { code: number; stdout: string; stderr: string };
          return { code: error.code, stdout: error.stdout, stderr: error.stderr };
        },
      );
      expect(result.code).toBe(duplicate ? 1 : 0);
      expect(result.stdout).not.toContain(secret);
      expect(result.stderr).not.toContain(secret);
      if (duplicate) expect(result.stderr).toBe('Native failure diagnostics unavailable\n');
      else expect(JSON.parse(result.stdout)).toEqual(expected);
      expect(await readFile(diagnostic, 'utf8')).toBe(original);
    },
  );

  it.each(['collection-error', 'report-unavailable'] as const)(
    'retains only a fixed %s classification when no test result is usable',
    async (kind) => {
      const { root, environment, diagnostic } = await prepare();
      const report =
        kind === 'collection-error'
          ? JSON.stringify({ errors: [{ message: secret, stack: secret }], suites: [] })
          : secret + '{broken-json';
      await writeFile(
        path.join(root, '.release-v2/native-learning-reports', nativeSuite + '.json'),
        report,
      );
      await expect(runReleaseSuite(root, nativeSuite, environment, true)).rejects.toThrow();
      expect(JSON.parse(await readFile(diagnostic, 'utf8'))).toEqual({
        schemaVersion: 1,
        failures: [{ testName: 'collection', engine: 'chromium', location: null, kind }],
      });
    },
  );

  it.each([false, true])(
    'keeps a real command exit7 failed with a fixed message even when diagnostic output is blocked=%s',
    async (blocked) => {
      const suite = 'browser-chromium-1';
      const { root, environment, diagnostic } = await prepare(suite);
      const script = path.join(root, 'node_modules/@playwright/test/cli.js');
      await mkdir(path.dirname(script), { recursive: true });
      await writeFile(
        script,
        [
          "const fs = require('node:fs');",
          `fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, ${JSON.stringify(JSON.stringify(failedReport(root, 'failed')))});`,
          "fs.writeFileSync('child-exit.json', JSON.stringify({ code: 7 }));",
          `process.stderr.write(${JSON.stringify(secret)});`,
          `process.stdout.write(${JSON.stringify(secret)});`,
          'process.exit(7);',
        ].join('\n'),
      );
      if (blocked) await mkdir(diagnostic, { recursive: true });
      const failure: unknown = await runReleaseSuite(root, suite, environment).catch(
        (error: unknown) => error,
      );
      expect(JSON.parse(await readFile(path.join(root, 'child-exit.json'), 'utf8'))).toEqual({
        code: 7,
      });
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({ code: 7 });
      expect((failure as Error).message).not.toContain(secret);
      expect((failure as Error).message).not.toContain(root);
      expect((failure as Error).message).not.toContain('Command failed:');
      expect(JSON.stringify(failure)).not.toContain(secret);
      await expect(
        readFile(path.join(root, '.release-v2/reports', suite + '-1.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      if (!blocked) {
        const text = await readFile(diagnostic, 'utf8');
        expect(text).not.toContain(secret);
        expect(text).not.toContain(root);
      }
    },
  );
});
