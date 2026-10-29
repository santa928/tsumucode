import path from 'node:path';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { loadExecutionBundle, readJson } from './runner';
import { readRecipe } from './candidate';
import { verifyCandidateArtifact } from './verify';
import { hashArtifact, hashValue, hashBytes } from './identity';
import { QualificationSchema } from './admission';
import { parseActualDeployment } from './baseline';
import {
  createVerifiedAppRecord,
  planAppRecordRecovery,
  verifyPublicDeployment,
} from './publication';
import { CommitSchema, DigestSchema } from './schema';

type ApiReply = { readonly status: number; readonly body: unknown };
export interface PublicationTransport {
  readonly api: (path: string) => Promise<ApiReply>;
  readonly publicFile: (url: string, expectedBytes: number) => Promise<Uint8Array>;
  readonly now: () => string;
}
async function boundedResponse(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (!response.body) throw Error('Missing publication response body');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.length;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw Error('Publication response exceeds size limit');
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/** Fixed GitHub endpoint and bounded public reads; no raw evidence or authorization is logged. */
export function publicationTransport(environment: NodeJS.ProcessEnv): PublicationTransport {
  return {
    now: () => new Date().toISOString(),
    async api(relative) {
      if (!/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\//u.test(relative))
        throw Error('Unsupported publication API path');
      const response = await fetch('https://api.github.com' + relative, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(environment.GITHUB_TOKEN
            ? { Authorization: 'Bearer ' + environment.GITHUB_TOKEN }
            : {}),
        },
      });
      const bytes = await boundedResponse(response, 1024 * 1024);
      return {
        status: response.status,
        body: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      };
    },
    async publicFile(url, expectedBytes) {
      if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0)
        throw Error('Invalid public artifact byte size');
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok || !response.body) throw Error('Public artifact request failed');
      const output = await boundedResponse(response, expectedBytes);
      if (output.length !== expectedBytes) throw Error('Public artifact size differs');
      return output;
    },
  };
}
async function apiBody(io: PublicationTransport, relative: string) {
  const result = await io.api(relative);
  if (result.status !== 200) throw Error('Publication API read failed: ' + String(result.status));
  return result.body;
}
async function currentInputs(
  root: string,
  environment: NodeJS.ProcessEnv,
  job: 'report',
  now: string,
) {
  const bundle = await loadExecutionBundle(root),
    { candidate, snapshot } = bundle;
  if (
    environment.GITHUB_REPOSITORY !== candidate.repository ||
    environment.GITHUB_SHA !== candidate.recipe.sourceCommit ||
    environment.GITHUB_RUN_ID !== candidate.runId ||
    environment.GITHUB_JOB !== job ||
    environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    environment.GITHUB_REF !== 'refs/heads/main' ||
    !/^[1-9]\d*$/u.test(environment.GITHUB_RUN_ATTEMPT ?? '') ||
    !Number.isSafeInteger(Number(environment.GITHUB_RUN_ATTEMPT)) ||
    Number(environment.GITHUB_RUN_ATTEMPT) < candidate.buildAttempt
  )
    throw Error('Wrong publication source, run or producer');
  const recipe = await readRecipe(root, candidate.recipe.sourceCommit, candidate.recipe.basePath);
  if (hashValue(recipe) !== hashValue(candidate.recipe)) throw Error('Publication recipe changed');
  await verifyCandidateArtifact(candidate, path.join(root, 'dist'));
  const qualificationBytes = await readFile(path.join(root, '.release-v2/qualification.json'));
  const expected = DigestSchema.parse(environment.RELEASE_FLOW_V2_QUALIFICATION_SHA256);
  if (hashBytes(qualificationBytes) !== expected)
    throw Error('Qualification bytes differ from pinned aggregate output');
  const qualification = QualificationSchema.parse(
    JSON.parse(qualificationBytes.toString('utf8')) as unknown,
  );
  if (
    qualification.candidateDigest !== hashValue(candidate) ||
    qualification.technical.candidateDigest !== hashValue(candidate) ||
    qualification.technical.buildAttempt !== candidate.buildAttempt ||
    hashValue(qualification.parent) !== hashValue(snapshot.plan.parent) ||
    Date.parse(qualification.qualifiedAt) > Date.parse(z.iso.datetime().parse(now)) ||
    Date.parse(qualification.technical.expiresAt) <= Date.parse(now)
  )
    throw Error('Qualification belongs to another candidate or parent');
  return { ...bundle, qualification };
}
async function actualDeployment(
  repository: string,
  siteUrl: string,
  workflowHead: string,
  io: PublicationTransport,
) {
  const prefix = '/repos/' + repository;
  const deployments = z
    .array(z.object({ id: z.number().int().positive() }).loose())
    .min(1)
    .parse(await apiBody(io, prefix + '/deployments?environment=github-pages&per_page=1'));
  const id = deployments[0]!.id;
  const statuses = z
    .array(z.unknown())
    .min(1)
    .parse(await apiBody(io, prefix + '/deployments/' + String(id) + '/statuses'));
  const actual = {
    repository,
    ...parseActualDeployment(deployments[0], statuses[0], repository, siteUrl),
  };
  if (actual.workflowHeadCommit !== workflowHead)
    throw Error('Actual v2 deployment has another workflow Source');
  return actual;
}
export async function verifyCurrentPublicDeployment(
  root: string,
  environment: NodeJS.ProcessEnv,
  io = publicationTransport(environment),
) {
  const { candidate } = await currentInputs(root, environment, 'report', io.now());
  const artifact = await hashArtifact(path.join(root, 'dist'));
  const siteUrl =
    'https://' + candidate.repository.split('/')[0]! + '.github.io' + candidate.recipe.basePath;
  const files = new Map(artifact.files.map((file) => [file.path, file]));
  return verifyPublicDeployment(
    candidate,
    artifact,
    () => actualDeployment(candidate.repository, siteUrl, candidate.recipe.sourceCommit, io),
    async (relative) => {
      const file = files.get(relative);
      if (!file) throw Error('Unknown public file');
      return io.publicFile(
        new URL(relative.split('/').map(encodeURIComponent).join('/'), siteUrl).href,
        file.bytes,
      );
    },
    io.now(),
  );
}
async function existingRecord(repository: string, tagName: string, io: PublicationTransport) {
  const prefix = '/repos/' + repository;
  const ref = await io.api(prefix + '/git/ref/tags/' + tagName);
  if (ref.status === 404) return undefined;
  if (ref.status !== 200) throw Error('App record lookup failed');
  const object = z
    .object({ object: z.object({ type: z.literal('tag'), sha: CommitSchema }) })
    .parse(ref.body);
  const annotated = z
    .object({
      tag: z.literal(tagName),
      message: z.string(),
      object: z.object({ type: z.literal('commit'), sha: CommitSchema }),
    })
    .parse(await apiBody(io, prefix + '/git/tags/' + object.object.sha));
  return { targetCommit: annotated.object.sha, message: annotated.message };
}
export async function prepareCurrentAppRecord(
  root: string,
  environment: NodeJS.ProcessEnv,
  io = publicationTransport(environment),
) {
  const { snapshot, candidate, qualification } = await currentInputs(
    root,
    environment,
    'report',
    io.now(),
  );
  const smoke = await readJson(path.join(root, '.release-v2/public-smoke.json'));
  const siteUrl =
    'https://' + candidate.repository.split('/')[0]! + '.github.io' + candidate.recipe.basePath;
  const actual = await actualDeployment(
    candidate.repository,
    siteUrl,
    candidate.recipe.sourceCommit,
    io,
  );
  const record = createVerifiedAppRecord(
    candidate,
    { inventory: snapshot.inventory, publicContent: snapshot.publicContent },
    qualification,
    smoke,
    actual,
    io.now(),
  );
  const tagName = 'tsumucode-app-' + candidate.runId + '-' + record.deploymentId;
  const plan = planAppRecordRecovery(
    record,
    actual,
    await existingRecord(candidate.repository, tagName, io),
  );
  return {
    schemaVersion: 1,
    state: plan.action === 'reuse-record' ? 'recorded' : 'record-plan-only',
    record,
    plan,
  };
}
