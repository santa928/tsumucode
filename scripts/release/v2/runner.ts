import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { BuildIdentitySchema, InventorySchema, PlanSchema } from './schema';
import { hashBytes, hashValue, ArtifactManifestSchema } from './identity';
import { storeSuiteReport } from './reports';
import { validateCapturedBaseline } from './parent';
import { planRelease } from './plan';
import {
  createExecutionPlan,
  ExecutionPlanSchema,
  testCommand,
  TEST_SUITES,
} from './executionPlan';
import { readRecipe } from './candidate';
import { executeSuite } from './execute';
import { observeTestSuite } from './observed';
import { readNextFixtureCoverage } from './nativeCoverage';
import { checkStaticArtifact } from '../checkStaticArtifact';
const exec = promisify(execFile);
const SnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    inventory: InventorySchema,
    plan: PlanSchema,
    publicContent: ArtifactManifestSchema,
  })
  .strict();
const BundleSchema = z
  .object({
    snapshot: SnapshotSchema,
    executionPlan: ExecutionPlanSchema,
    candidate: BuildIdentitySchema,
    capturedBaseline: z.unknown().optional(),
  })
  .strict();
export async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}
export function validateExecutionBundle(input: unknown) {
  const bundle = BundleSchema.parse(input),
    baseline =
      bundle.capturedBaseline === undefined
        ? undefined
        : validateCapturedBaseline(bundle.capturedBaseline).baseline;
  const { snapshot, executionPlan, candidate } = bundle;
  if (
    candidate.buildJobId !== 'build' ||
    hashValue(snapshot.plan) !== hashValue(planRelease(snapshot.inventory, baseline)) ||
    hashValue(executionPlan) !==
      hashValue(
        createExecutionPlan(
          snapshot.plan,
          executionPlan.testManifests,
          executionPlan.publicContentDigest,
        ),
      ) ||
    executionPlan.publicContentDigest !== hashValue(snapshot.publicContent) ||
    candidate.planDigest !== hashValue({ plan: snapshot.plan, executionPlan })
  )
    throw new Error('Candidate, source obligations or actual parent differ');
  return bundle;
}
export async function loadExecutionBundle(root: string) {
  return validateExecutionBundle({
    snapshot: await readJson(path.join(root, '.release-v2/preparation.json')),
    executionPlan: await readJson(path.join(root, '.release-v2/execution-plan.json')),
    candidate: await readJson(path.join(root, '.release-v2/candidate.json')),
    capturedBaseline: await readJson(path.join(root, '.release-v2/baseline.json')),
  });
}
async function absent(file: string) {
  try {
    await lstat(file);
    throw new Error('Verification output already exists');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
/** Fixed source commands only. No command, report path or target list can be supplied by a receipt. */
export async function runReleaseSuite(
  root: string,
  suite: string,
  environment: NodeJS.ProcessEnv = process.env,
  observeNative = false,
) {
  const bundle = await loadExecutionBundle(root),
    { snapshot, executionPlan, candidate } = bundle;
  const requirement = executionPlan.requirements.find((item) => item.suite === suite);
  if (!requirement) throw new Error('Unknown required suite');
  if (
    environment.GITHUB_REPOSITORY !== candidate.repository ||
    environment.GITHUB_RUN_ID !== candidate.runId ||
    environment.GITHUB_SHA !== candidate.recipe.sourceCommit ||
    environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    environment.GITHUB_REF !== 'refs/heads/main'
  )
    throw new Error('Wrong source or release event');
  const recipe = await readRecipe(root, candidate.recipe.sourceCommit, candidate.recipe.basePath);
  if (hashValue(recipe) !== hashValue(candidate.recipe)) throw new Error('Source recipe changed');
  if (
    observeNative !==
    (suite === 'native-next' ||
      TEST_SUITES.some((row) => row.suite === suite && row.producerJobId === 'boundary'))
  )
    throw new Error('Wrong native execution path');
  const context = {
    runId: environment.GITHUB_RUN_ID,
    jobId: environment.GITHUB_JOB,
    attempt: Number(environment.GITHUB_RUN_ATTEMPT),
  };
  const driver = async () => {
    const directory = path.join(root, '.release-v2/checks');
    await mkdir(directory, { recursive: true });
    const reportFile = path.join(directory, suite + '.json');
    const commandReports: {
      command: readonly string[];
      stdoutDigest: string;
      stderrDigest: string;
    }[] = [];
    const command = async (args: readonly string[], env: NodeJS.ProcessEnv = environment) => {
      process.stdout.write('release ' + suite + ': ' + args.join(' ') + '\n');
      const result = await exec(args[0]!, args.slice(1), {
        cwd: root,
        env: {
          ...env,
          CI: 'true',
          BASE_PATH: candidate.recipe.basePath,
          TSUMUCODE_RELEASE_V2: '1',
        },
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 2 * 60 * 60 * 1000,
      });
      commandReports.push({
        command: args,
        stdoutDigest: hashBytes(result.stdout),
        stderrDigest: hashBytes(result.stderr),
      });
    };
    if (observeNative) {
      if (suite === 'native-next') {
        const source = await readFile(
          path.join(root, '.release-next-native-ci/fixtures.log'),
          'utf8',
        );
        const rows = source
          .split('\n')
          .filter((line) => line.startsWith('{"fixture":'))
          .map((line) => JSON.parse(line) as unknown);
        const targets = readNextFixtureCoverage(
          rows,
          snapshot.plan.targets.filter(
            (target) =>
              target.kind === 'fixture' && target.runtimeKind === 'next' && target.mode === 'local',
          ),
        );
        return {
          targets,
          report: { kind: 'actual-native-fixtures', sourceDigest: hashBytes(source), rows },
        };
      }
      const report = await readJson(
        path.join(
          root,
          suite.startsWith('native-learning-')
            ? '.release-v2/native-learning-reports/' + suite + '.json'
            : 'test-results/local-python/results.json',
        ),
      );
      return {
        targets: observeTestSuite(suite, report, snapshot.plan, executionPlan, snapshot.inventory),
        report,
      };
    }
    await absent(reportFile);
    if (executionPlan.testManifests.some((item) => item.suite === suite)) {
      await command(
        [
          process.execPath,
          path.join(root, 'node_modules/@playwright/test/cli.js'),
          ...testCommand(suite, false),
          '--reporter=json',
          '--output=' + path.join(directory, suite + '-artifacts'),
        ],
        {
          ...environment,
          PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
        },
      );
      const report = await readJson(reportFile);
      return {
        targets: observeTestSuite(suite, report, snapshot.plan, executionPlan, snapshot.inventory),
        report,
      };
    }
    if (suite === 'artifact-preflight') {
      const staticReport = await checkStaticArtifact(
        path.join(root, 'dist'),
        snapshot.inventory,
        snapshot.publicContent,
      );
      await command([
        'npm',
        'run',
        'test:bundle',
        '--',
        '--reporter=json',
        '--outputFile=' + reportFile,
      ]);
      verifyUnitReport(await readJson(reportFile));
      await command([process.execPath, '--import', 'tsx', 'scripts/check-learning-chunks.ts']);
      return {
        targets: ['artifact/static', 'artifact/bundle', 'artifact/chunks'],
        report: { staticReport, commandReports },
      };
    }
    if (suite === 'unit') {
      await command(['npm', 'run', 'lint']);
      await command([
        'npm',
        'run',
        'test:run',
        '--',
        '--reporter=default',
        '--reporter=json',
        '--outputFile=' + reportFile,
      ]);
      verifyUnitReport(await readJson(reportFile));
      return {
        targets: ['unit/full'],
        report: { commandReports, result: await readJson(reportFile) },
      };
    }
    if (suite === 'performance') {
      await absent(path.join(root, '.lighthouseci/assertion-results.json'));
      await command(['npm', 'run', 'test:lighthouse']);
      const originalAssertions = await readJson(
        path.join(root, '.lighthouseci/assertion-results.json'),
      );
      const assertions = z
        .array(z.object({ level: z.string().optional(), passed: z.boolean() }))
        .min(1)
        .parse(originalAssertions);
      if (assertions.some((row) => row.level === 'error' && !row.passed))
        throw new Error('Lighthouse budget failed');
      return {
        targets: ['performance/lighthouse'],
        report: { commandReports, assertions: originalAssertions },
      };
    }
    throw new Error('Unimplemented fixed suite');
  };
  let actualReport: unknown;
  const result = await executeSuite(
    candidate,
    requirement,
    context,
    path.join(root, 'dist'),
    async () => {
      const observation = await driver();
      actualReport = observation.report;
      return observation;
    },
  );
  await storeSuiteReport(root, result, actualReport);
  return result;
}
function verifyUnitReport(input: unknown) {
  z.object({
    success: z.literal(true),
    numTotalTests: z.number().int().positive(),
    numFailedTests: z.literal(0),
    numFailedTestSuites: z.literal(0),
    numPendingTests: z.literal(0),
    numTodoTests: z.literal(0),
  }).parse(input);
}
