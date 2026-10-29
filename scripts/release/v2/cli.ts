import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { compileContent } from '../../content/compile';
import { checkStaticArtifact } from '../checkStaticArtifact';
import { buildInventory } from './inventory';
import { hashValue, ArtifactManifestSchema } from './identity';
import { writeProtocolJson } from './json';
import { readLegacyEvidence } from './legacy';
import { planRelease } from './plan';
import { compareLegacy } from './shadow';
import { InventorySchema, PlanSchema } from './schema';
import { prepareRelease, createAuthoringPreview } from './prepare';
import { createCandidate } from './candidate';
import { captureBaseline } from './captureBaseline';
import { validateCapturedBaseline } from './parent';
import { collectExecutionPlan, ExecutionPlanSchema, createExecutionPlan } from './executionPlan';
import { runReleaseSuite } from './runner';
import { qualifyCurrentRelease } from './qualify';
import {
  inspectContentOriginal,
  readVerifiedContentPolicy,
  ContentInspectionRequestSchema,
} from './contentOriginals';
import { verifyNativeCatalogFile } from './nativeCatalog';
import { verifyContent } from './content';
import {
  verifyCurrentPublicDeployment,
  prepareCurrentAppRecord,
  runCurrentPublicOperations,
} from './publicationService';
import { readInventoryAtSource } from './sourceInventory';

const PreparationSchema = z
  .object({
    schemaVersion: z.literal(1),
    inventory: InventorySchema,
    plan: PlanSchema,
    publicContent: ArtifactManifestSchema.optional(),
  })
  .strict();
const optionNames: Readonly<Record<string, readonly string[]>> = {
  shadow: [],
  'inspect-content': ['private-root', 'request'],
  'stage-content': [],
  'verify-native-catalog': ['file'],
  baseline: ['repository', 'site-url'],
  prepare: ['baseline', 'public-output', 'authoring-output'],
  preview: [],
  candidate: ['snapshot', 'baseline', 'artifact-id', 'dist', 'execution-plan'],
  freeze: ['snapshot', 'baseline'],
  static: ['snapshot', 'dist'],
  'run-suite': ['suite'],
  'observe-native': ['suite'],
  qualify: [],
  'public-smoke': [],
  'public-operations': [],
  'record-plan': [],
};
async function jsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}
function required(value: string | undefined, name: string) {
  if (!value) throw new Error('Missing ' + name);
  return value;
}
async function shadow(root: string) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'release-shadow-'));
  try {
    const compilation = await compileContent({
      sourceRoot: path.join(root, 'content'),
      outputRoot: path.join(temporary, 'generated/content'),
      // Shadow consumes the fully validated in-memory compilation, never a generated tree.
      checkOnly: true,
      publication: 'public',
    });
    const inventory = buildInventory(compilation.compilations);
    const legacy = await readLegacyEvidence(
      root,
      inventory.courses
        .filter((course) => course.publicationStatus === 'published')
        .map((course) => course.id),
    );
    return {
      schemaVersion: 1,
      status: 'shadow-only',
      inventory,
      inventoryDigest: hashValue(inventory),
      plan: planRelease(inventory),
      shadow: compareLegacy(inventory, legacy),
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Fixed commands only. Candidate construction is technical identity, never publication approval. */
export async function runCli(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const [command, ...rest] = args;
  if (!command || !Object.hasOwn(optionNames, command))
    throw new Error('Unknown release v2 command');
  const options: Record<string, { type: 'string' }> = {
    root: { type: 'string' },
    output: { type: 'string' },
  };
  for (const name of optionNames[command]!) options[name] = { type: 'string' };
  const { values } = parseArgs({ args: rest, options, strict: true, allowPositionals: false });
  const root = path.resolve(values.root ?? process.cwd());
  const output = path.resolve(root, required(values.output, '--output'));
  for (const protectedPath of [
    'dist',
    'public',
    '.release-v2/authoring-dist',
    '.release-v2/authoring-public',
  ]) {
    const protectedRoot = path.resolve(root, protectedPath);
    if (output === protectedRoot || output.startsWith(protectedRoot + path.sep))
      throw new Error('Receipt output overlaps artifact data');
  }
  try {
    await lstat(output);
    throw new Error('Output already exists');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const input = (value: string | undefined, name: string) =>
    path.resolve(root, required(value, name));
  const baseline = values.baseline
    ? validateCapturedBaseline(await jsonFile(input(values.baseline, '--baseline'))).baseline
    : undefined;
  let result: unknown;
  switch (command) {
    case 'inspect-content': {
      const request = ContentInspectionRequestSchema.parse(
        await jsonFile(input(values.request, '--request')),
      );
      const source = await readInventoryAtSource(
        root,
        request.metadata.sourceCommit,
        request.metadata.courseId,
      );
      result = {
        schemaVersion: 1,
        receipts: [
          await inspectContentOriginal(
            input(values['private-root'], '--private-root'),
            request.reference,
            request.metadata,
            request.inspectorId,
            source,
          ),
        ],
      };
      break;
    }
    case 'verify-native-catalog': {
      const snapshot = PreparationSchema.parse(
        await jsonFile(path.join(root, '.release-v2/preparation.json')),
      );
      result = await verifyNativeCatalogFile(snapshot.inventory, input(values.file, '--file'));
      break;
    }
    case 'stage-content': {
      const snapshot = PreparationSchema.parse(
        await jsonFile(path.join(root, '.release-v2/preparation.json')),
      );
      const captured = validateCapturedBaseline(
        await jsonFile(path.join(root, '.release-v2/baseline.json')),
      );
      const policy = await readVerifiedContentPolicy(
        root,
        path.join(root, 'docs/quality/content-v2-receipts.json'),
      );
      verifyContent(snapshot.inventory, policy.receipts, captured.baseline, policy.withdrawals);
      result = policy;
      break;
    }
    case 'shadow':
      result = await shadow(root);
      break;
    case 'run-suite':
    case 'observe-native':
      result = await runReleaseSuite(
        root,
        required(values.suite, '--suite'),
        environment,
        command === 'observe-native',
      );
      break;
    case 'qualify':
      result = await qualifyCurrentRelease(root, environment);
      break;
    case 'public-smoke':
      result = await verifyCurrentPublicDeployment(root, environment);
      break;
    case 'public-operations':
      result = await runCurrentPublicOperations(root, environment);
      break;
    case 'record-plan':
      result = await prepareCurrentAppRecord(root, environment);
      break;
    case 'baseline':
      result = validateCapturedBaseline(
        await captureBaseline({
          root,
          repository: required(values.repository, '--repository'),
          siteUrl: required(values['site-url'], '--site-url'),
        }),
      );
      break;
    case 'prepare':
      result = await prepareRelease(
        path.join(root, 'content'),
        values['public-output']
          ? input(values['public-output'], '--public-output')
          : path.join(root, 'public/generated/content'),
        values['authoring-output']
          ? input(values['authoring-output'], '--authoring-output')
          : path.join(root, '.release-v2/authoring-public/generated/content'),
        baseline,
      );
      break;
    case 'preview':
      result = await createAuthoringPreview(root);
      break;
    case 'static': {
      const snapshot = PreparationSchema.parse(
        await jsonFile(input(values.snapshot, '--snapshot')),
      );
      result = await checkStaticArtifact(
        values.dist ? input(values.dist, '--dist') : path.join(root, 'dist'),
        snapshot.inventory,
        snapshot.publicContent,
      );
      break;
    }
    case 'freeze': {
      const snapshot = PreparationSchema.parse(
        await jsonFile(input(values.snapshot, '--snapshot')),
      );
      if (hashValue(snapshot.plan) !== hashValue(planRelease(snapshot.inventory, baseline)))
        throw new Error('Snapshot plan differs from its inventory or parent');
      if (!snapshot.publicContent) throw new Error('Missing single-compile public closure');
      result = await collectExecutionPlan(root, snapshot.plan, hashValue(snapshot.publicContent));
      break;
    }
    case 'candidate': {
      const snapshot = PreparationSchema.parse(
        await jsonFile(input(values.snapshot, '--snapshot')),
      );
      if (hashValue(snapshot.plan) !== hashValue(planRelease(snapshot.inventory, baseline)))
        throw new Error('Snapshot plan differs from its inventory or parent');
      if (values['execution-plan']) {
        const execution = ExecutionPlanSchema.parse(
          await jsonFile(input(values['execution-plan'], '--execution-plan')),
        );
        if (
          hashValue(execution) !==
            hashValue(
              createExecutionPlan(
                snapshot.plan,
                execution.testManifests,
                execution.publicContentDigest,
              ),
            ) ||
          !snapshot.publicContent ||
          execution.publicContentDigest !== hashValue(snapshot.publicContent)
        )
          throw new Error('Execution plan differs from required test obligations');
      }
      result = await createCandidate(
        root,
        values.dist ? input(values.dist, '--dist') : path.join(root, 'dist'),
        snapshot.plan,
        required(values['artifact-id'], '--artifact-id'),
        {
          repository: required(environment.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY'),
          runId: required(environment.GITHUB_RUN_ID, 'GITHUB_RUN_ID'),
          jobId: required(environment.GITHUB_JOB, 'GITHUB_JOB'),
          attempt: Number(required(environment.GITHUB_RUN_ATTEMPT, 'GITHUB_RUN_ATTEMPT')),
          sourceCommit: required(environment.GITHUB_SHA, 'GITHUB_SHA'),
          eventName: required(environment.GITHUB_EVENT_NAME, 'GITHUB_EVENT_NAME'),
          ref: required(environment.GITHUB_REF, 'GITHUB_REF'),
        },
        environment.BASE_PATH ?? '/',
        values['execution-plan']
          ? ExecutionPlanSchema.parse(
              await jsonFile(input(values['execution-plan'], '--execution-plan')),
            )
          : undefined,
      );
      break;
    }
  }
  if (result === undefined) throw new Error('Unimplemented release command');
  await writeProtocolJson(output, result);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write((error instanceof Error ? error.message : 'Release v2 failed') + '\n');
    process.exitCode = 1;
  });
}
