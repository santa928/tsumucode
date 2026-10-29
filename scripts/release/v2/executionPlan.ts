import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { PlanSchema, type ReleasePlan } from './schema';
import { SuiteRequirementSchema } from './verify';
import { hashValue } from './identity';
import { parseTestList, TestSuiteManifestSchema, type TestSuiteManifest } from './testManifest';
const exec = promisify(execFile);
export const TEST_SUITES = [
  {
    suite: 'browser-chromium-1',
    producerJobId: 'browser',
    project: 'chromium',
    args: ['--project=chromium', '--shard=1/2'],
  },
  {
    suite: 'browser-chromium-2',
    producerJobId: 'browser',
    project: 'chromium',
    args: ['--project=chromium', '--shard=2/2'],
  },
  {
    suite: 'browser-firefox',
    producerJobId: 'browser',
    project: 'firefox',
    args: ['--project=firefox'],
  },
  {
    suite: 'browser-webkit',
    producerJobId: 'browser',
    project: 'webkit',
    args: ['--project=webkit'],
  },
  {
    suite: 'browser-public',
    producerJobId: 'public_boundary',
    project: 'chromium',
    args: ['manifest-progress-roundtrip.spec.ts', '--project=chromium'],
  },
  { suite: 'native-python', producerJobId: 'boundary', project: '', args: [] },
  ...(['chromium', 'firefox', 'webkit'] as const).map((engine) => ({
    suite: `native-learning-${engine}` as const,
    producerJobId: 'boundary' as const,
    project: engine,
    args: ['--project=' + engine],
  })),
  {
    suite: 'browser-performance',
    producerJobId: 'performance',
    project: 'chromium',
    args: ['--project=chromium'],
  },
] as const;
export const ExecutionPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    releasePlanDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    publicContentDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    testManifests: z.array(TestSuiteManifestSchema).length(TEST_SUITES.length),
    requirements: z.array(SuiteRequirementSchema).min(1),
  })
  .strict();
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
function fixtureOwner(
  plan: ReleasePlan,
  manifests: readonly TestSuiteManifest[],
  exerciseId: string,
  mode: string,
) {
  const choices = manifests.filter(
    (manifest) =>
      (mode === 'cpython'
        ? manifest.suite === 'native-python'
        : manifest.suite === 'browser-chromium-1' || manifest.suite === 'browser-chromium-2') &&
      manifest.tests.some((test) => test.exerciseIds.includes(exerciseId)),
  );
  if (choices.length !== 1)
    throw new Error(
      'Missing or duplicated actual fixture driver: ' +
        exerciseId +
        '/' +
        mode +
        ' in ' +
        plan.publishedCourses.join(','),
    );
  return choices[0]!.suite;
}
/** Expected targets are assigned from independently frozen source tests, never from success self-reports. */
export function createExecutionPlan(
  planInput: unknown,
  manifestsInput: unknown,
  publicContentDigest?: string,
): ExecutionPlan {
  const plan = PlanSchema.parse(planInput),
    manifests = z.array(TestSuiteManifestSchema).length(TEST_SUITES.length).parse(manifestsInput);
  if (
    new Set(manifests.map(({ suite }) => suite)).size !== manifests.length ||
    TEST_SUITES.some(
      (expected) =>
        !manifests.some(
          (actual) =>
            actual.suite === expected.suite &&
            actual.producerJobId === expected.producerJobId &&
            actual.project === expected.project,
        ),
    )
  )
    throw new Error('Missing or untrusted test producer');
  for (const manifest of manifests)
    if (new Set(manifest.tests.map(({ key }) => key)).size !== manifest.tests.length)
      throw new Error('Duplicate declared test');
  const chromium = manifests
    .filter(({ suite }) => suite === 'browser-chromium-1' || suite === 'browser-chromium-2')
    .flatMap(({ tests }) => tests.map(({ key }) => key));
  if (new Set(chromium).size !== chromium.length)
    throw new Error('Duplicate test across Chromium shards');
  const assigned = new Map(
    manifests.map((manifest) => [
      manifest.suite,
      manifest.tests.map(({ key }) => 'test/' + manifest.suite + '/' + key),
    ]),
  );
  const nativeNext: string[] = [];
  for (const target of plan.targets) {
    if (target.kind === 'fixture') {
      if (!target.exerciseId || !target.mode || !target.sourceDigest || !target.expectedStatus)
        throw new Error('Incomplete runtime-mode target');
      if (target.mode === 'local' && target.runtimeKind === 'next') nativeNext.push(target.key);
      else
        assigned
          .get(fixtureOwner(plan, manifests, target.exerciseId, target.mode))!
          .push(target.key);
    } else if (target.kind === 'learning-engine') {
      const owners = manifests.filter(
        (manifest) =>
          manifest.project === target.engine &&
          manifest.producerJobId === (target.runtimeKind === 'next' ? 'boundary' : 'browser') &&
          manifest.tests.some((test) =>
            test.lessonKeys?.includes(target.courseId + '/' + target.lessonId),
          ),
      );
      if (owners.length !== 1)
        throw Error('New-Lesson learning engine driver missing or duplicated');
      assigned.get(owners[0]!.suite)!.push(target.key);
    } else if (target.kind === 'persistence') assigned.get('browser-public')!.push(target.key);
  }
  const releasePlanDigest = hashValue(plan),
    testDigest = hashValue(manifests);
  const requirement = (suite: string, producerJobId: string, inputTargets: readonly string[]) => {
    const targets = [...inputTargets].sort();
    if (!targets.length || new Set(targets).size !== targets.length)
      throw new Error('Empty or duplicate suite obligation');
    return SuiteRequirementSchema.parse({
      suite,
      producerJobId,
      targets,
      inputDigest: hashValue({ suite, targets, releasePlanDigest, testDigest }),
    });
  };
  return ExecutionPlanSchema.parse({
    schemaVersion: 1,
    releasePlanDigest,
    ...(publicContentDigest ? { publicContentDigest } : {}),
    testManifests: manifests,
    requirements: [
      requirement('artifact-preflight', 'build', [
        'artifact/static',
        'artifact/bundle',
        'artifact/chunks',
      ]),
      requirement('unit', 'unit', ['unit/full']),
      ...manifests.map((manifest) =>
        requirement(manifest.suite, manifest.producerJobId, assigned.get(manifest.suite)!),
      ),
      requirement('performance', 'performance', ['performance/lighthouse']),
      ...(nativeNext.length ? [requirement('native-next', 'boundary', nativeNext)] : []),
    ],
  });
}
export function testCommand(suite: string, list: boolean): string[] {
  const definition = TEST_SUITES.find((item) => item.suite === suite);
  if (!definition) throw new Error('Unknown fixed test suite');
  const config = suite.startsWith('native-learning-')
    ? 'playwright.learning-native.config.ts'
    : suite === 'native-python'
      ? 'playwright.python-local.config.ts'
      : suite === 'browser-performance'
        ? 'playwright.performance.config.ts'
        : suite === 'browser-public'
          ? 'playwright.config.ts'
          : 'playwright.authoring.config.ts';
  return [
    'test',
    '--config=' + config,
    ...definition.args,
    '--grep-invert',
    '@visual-extended',
    ...(list ? ['--list', '--reporter=json'] : ['--workers=1', '--retries=0']),
  ];
}
/** Same checkout/lock, fixed commands only. Source collection starts no browser or learner execution. */
export async function collectExecutionPlan(
  root: string,
  planInput: unknown,
  publicContentDigest?: string,
) {
  const manifests: TestSuiteManifest[] = [];
  for (const definition of TEST_SUITES) {
    const output = await exec(
      process.execPath,
      [
        path.join(root, 'node_modules/@playwright/test/cli.js'),
        ...testCommand(definition.suite, true),
      ],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120000,
        env: {
          ...process.env,
          BASE_PATH: definition.producerJobId === 'boundary' ? '/' : process.env['BASE_PATH'],
        },
      },
    );
    manifests.push(
      parseTestList(
        JSON.parse(output.stdout) as unknown,
        definition.suite,
        definition.producerJobId,
        definition.project,
      ),
    );
  }
  const output = await exec(
    process.execPath,
    [
      path.join(root, 'node_modules/@playwright/test/cli.js'),
      'test',
      '--config=playwright.authoring.config.ts',
      '--project=chromium',
      '--grep-invert',
      '@visual-extended',
      '--list',
      '--reporter=json',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 },
  );
  const full = parseTestList(
    JSON.parse(output.stdout) as unknown,
    'browser-all',
    'browser',
    'chromium',
  );
  const combined = manifests
    .filter(({ suite }) => suite === 'browser-chromium-1' || suite === 'browser-chromium-2')
    .flatMap(({ tests }) => tests.map(({ key }) => key))
    .sort();
  if (JSON.stringify(full.tests.map(({ key }) => key).sort()) !== JSON.stringify(combined))
    throw new Error('Chromium shard union omits source tests');
  return createExecutionPlan(planInput, manifests, publicContentDigest);
}
