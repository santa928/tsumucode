// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { releaseFixture, syntheticPublishedOperations } from './releaseFixture';
import { hashArtifact, hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import * as recipes from '../../../../scripts/release/v2/candidate';
import {
  verifyCurrentPublicDeployment,
  prepareCurrentAppRecord,
} from '../../../../scripts/release/v2/publicationService';
import type { PublicationTransport } from '../../../../scripts/release/v2/publicationService';
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'publication-service-'));
  roots.push(root);
  await mkdir(path.join(root, '.release-v2'));
  await mkdir(path.join(root, 'dist'));
  const bytes = Buffer.from('candidate public bytes');
  await writeFile(path.join(root, 'dist/index.html'), bytes);
  const bundle = releaseFixture();
  bundle.candidate.artifactDigest = (await hashArtifact(path.join(root, 'dist'))).digest;
  const values = {
    preparation: bundle.snapshot,
    'execution-plan': bundle.executionPlan,
    candidate: bundle.candidate,
    baseline: bundle.capturedBaseline,
  };
  for (const [name, value] of Object.entries(values))
    await writeFile(path.join(root, '.release-v2/' + name + '.json'), JSON.stringify(value));
  const qualification = {
    schemaVersion: 1,
    status: 'qualified',
    candidateDigest: hashValue(bundle.candidate),
    qualifiedAt: '2026-10-29T02:00:00Z',
    parent: bundle.snapshot.plan.parent,
    technical: {
      status: 'technical-passed',
      candidateDigest: hashValue(bundle.candidate),
      buildAttempt: bundle.candidate.buildAttempt,
      verificationAttempts: [1],
      expiresAt: '2026-10-30T02:00:00Z',
      suites: ['unit'],
    },
    content: {
      status: 'maintenance',
      carriedLessons: ['topic/lesson'],
      newlyApprovedLessons: [],
      technicalRechecks: [],
    },
    projects: [],
  };
  const qualificationBytes = Buffer.from(JSON.stringify(qualification));
  await writeFile(path.join(root, '.release-v2/qualification.json'), qualificationBytes);
  const environment = {
    GITHUB_REPOSITORY: bundle.candidate.repository,
    GITHUB_SHA: bundle.candidate.recipe.sourceCommit,
    GITHUB_RUN_ID: bundle.candidate.runId,
    GITHUB_JOB: 'report',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ATTEMPT: '1',
    RELEASE_FLOW_V2_QUALIFICATION_SHA256: hashBytes(qualificationBytes),
  };
  // Actual recipe/clean-tree verification has separate real-Git tests. Keep it observable here.
  const recipe = vi.spyOn(recipes, 'readRecipe').mockResolvedValue(bundle.candidate.recipe);
  const requests: string[] = [];
  let existing: { targetCommit: string; message: string } | undefined;
  let deploymentId = 501;
  let workflowHead = bundle.candidate.recipe.sourceCommit;
  let clock = '2026-10-29T02:01:00Z';
  let createdAt: string | undefined = '2026-10-29T02:00:15Z';
  const io: PublicationTransport = {
    now: () => clock,
    publicFile: async (url, size) => {
      expect(url).toBe('https://owner.github.io/site/index.html');
      expect(size).toBe(bytes.length);
      return bytes;
    },
    api: async (url) => {
      requests.push(url);
      if (url.endsWith('/deployments?environment=github-pages&per_page=1'))
        return {
          status: 200,
          body: [
            {
              id: deploymentId,
              sha: workflowHead,
              ref: 'main',
              environment: 'github-pages',
              created_at: createdAt,
            },
          ],
        };
      if (url.endsWith('/statuses'))
        return {
          status: 200,
          body: [
            {
              state: 'success',
              environment_url: 'https://owner.github.io/site/',
              log_url: 'https://github.com/owner/site/actions/runs/101/job/201',
            },
          ],
        };
      if (url.includes('/git/ref/tags/'))
        return existing
          ? { status: 200, body: { object: { type: 'tag', sha: '9'.repeat(40) } } }
          : { status: 404, body: {} };
      if (url.endsWith('/git/tags/' + '9'.repeat(40)))
        return {
          status: 200,
          body: {
            tag: 'tsumucode-app-101-501',
            object: { type: 'commit', sha: existing!.targetCommit },
            message: existing!.message,
          },
        };
      throw Error('Unexpected API read: ' + url);
    },
  };
  return {
    root,
    bundle,
    environment,
    qualification,
    io,
    recipe,
    requests,
    setExisting(value: typeof existing) {
      existing = value;
    },
    moveDeployment() {
      deploymentId++;
    },
    setClock(value: string) {
      clock = value;
    },
    setDeploymentClock(value: string | undefined) {
      createdAt = value;
    },
    changeWorkflow() {
      workflowHead = '0'.repeat(40);
    },
  };
}
it('binds public smoke and a sanitized record plan to the pinned aggregate and actual deployment without writing', async () => {
  const row = await setup();
  const smoke = await verifyCurrentPublicDeployment(row.root, row.environment, row.io);
  expect(smoke.checkedFiles).toBe(1);
  expect(row.recipe).toHaveBeenCalledWith(row.root, row.environment.GITHUB_SHA, '/site/');
  await writeFile(path.join(row.root, '.release-v2/public-smoke.json'), JSON.stringify(smoke));
  await writeFile(
    path.join(row.root, '.release-v2/public-operations.json'),
    JSON.stringify(
      await syntheticPublishedOperations(
        row.bundle.candidate,
        row.bundle.snapshot.inventory,
        smoke.actual,
        row.io.now(),
      ),
    ),
  );
  const prepared = await prepareCurrentAppRecord(row.root, row.environment, row.io);
  expect(prepared).toMatchObject({
    state: 'record-plan-only',
    plan: { action: 'create-annotated-record', tagName: 'tsumucode-app-101-501' },
  });
  expect(prepared.record.workflowHeadCommit).toBe(row.environment.GITHUB_SHA);
  row.setExisting({
    targetCommit: row.environment.GITHUB_SHA,
    message: JSON.stringify(prepared.record),
  });
  expect(await prepareCurrentAppRecord(row.root, row.environment, row.io)).toMatchObject({
    state: 'recorded',
    plan: { action: 'reuse-record' },
  });
});
it.each([
  'source',
  'run',
  'job',
  'ref',
  'event',
  'attempt',
  'qualification-pin',
  'qualification-candidate',
  'qualification-parent',
  'artifact',
  'recipe',
  'workflow',
  'expired',
])('refuses a %s mismatch before creating a record plan', async (kind) => {
  const row = await setup();
  if (kind === 'source') row.environment.GITHUB_SHA = '0'.repeat(40);
  if (kind === 'run') row.environment.GITHUB_RUN_ID = '999';
  if (kind === 'job') row.environment.GITHUB_JOB = 'record_release';
  if (kind === 'ref') row.environment.GITHUB_REF = 'refs/heads/feature';
  if (kind === 'event') row.environment.GITHUB_EVENT_NAME = 'pull_request';
  if (kind === 'attempt') row.environment.GITHUB_RUN_ATTEMPT = '0';
  if (kind === 'qualification-pin')
    row.environment.RELEASE_FLOW_V2_QUALIFICATION_SHA256 = '0'.repeat(64);
  if (kind.startsWith('qualification-') && kind !== 'qualification-pin') {
    const value = structuredClone(row.qualification);
    if (kind === 'qualification-candidate') value.candidateDigest = '0'.repeat(64);
    else value.parent!.deploymentId = '999';
    const bytes = Buffer.from(JSON.stringify(value));
    await writeFile(path.join(row.root, '.release-v2/qualification.json'), bytes);
    row.environment.RELEASE_FLOW_V2_QUALIFICATION_SHA256 = hashBytes(bytes);
  }
  if (kind === 'expired') {
    row.qualification.technical.expiresAt = '2026-10-29T02:00:10Z';
    const bytes = Buffer.from(JSON.stringify(row.qualification));
    await writeFile(path.join(row.root, '.release-v2/qualification.json'), bytes);
    row.environment.RELEASE_FLOW_V2_QUALIFICATION_SHA256 = hashBytes(bytes);
  }
  if (kind === 'artifact') await writeFile(path.join(row.root, 'dist/index.html'), 'changed');
  if (kind === 'recipe')
    row.recipe.mockResolvedValue({ ...row.bundle.candidate.recipe, lockDigest: '0'.repeat(64) });
  if (kind === 'workflow') row.changeWorkflow();
  await expect(verifyCurrentPublicDeployment(row.root, row.environment, row.io)).rejects.toThrow();
});
it('refuses record preparation after actual deployment moves or the immutable tag conflicts', async () => {
  const row = await setup();
  const smoke = await verifyCurrentPublicDeployment(row.root, row.environment, row.io);
  await writeFile(path.join(row.root, '.release-v2/public-smoke.json'), JSON.stringify(smoke));
  await writeFile(
    path.join(row.root, '.release-v2/public-operations.json'),
    JSON.stringify(
      await syntheticPublishedOperations(
        row.bundle.candidate,
        row.bundle.snapshot.inventory,
        smoke.actual,
        row.io.now(),
      ),
    ),
  );
  const prepared = await prepareCurrentAppRecord(row.root, row.environment, row.io);
  row.setExisting({ targetCommit: '0'.repeat(40), message: JSON.stringify(prepared.record) });
  await expect(prepareCurrentAppRecord(row.root, row.environment, row.io)).rejects.toThrow(
    /Immutable/,
  );
  row.setExisting(undefined);
  row.moveDeployment();
  await expect(prepareCurrentAppRecord(row.root, row.environment, row.io)).rejects.toThrow();
  expect(
    JSON.parse(await readFile(path.join(row.root, '.release-v2/public-smoke.json'), 'utf8')),
  ).toEqual(smoke);
});

it('recovers only the already deployed candidate after expiry without renewing publication permission', async () => {
  const row = await setup();
  row.setClock('2026-10-31T02:01:00Z');
  const smoke = await verifyCurrentPublicDeployment(row.root, row.environment, row.io);
  await writeFile(path.join(row.root, '.release-v2/public-smoke.json'), JSON.stringify(smoke));
  await writeFile(
    path.join(row.root, '.release-v2/public-operations.json'),
    JSON.stringify(
      await syntheticPublishedOperations(
        row.bundle.candidate,
        row.bundle.snapshot.inventory,
        smoke.actual,
        row.io.now(),
      ),
    ),
  );
  const prepared = await prepareCurrentAppRecord(row.root, row.environment, row.io);
  expect(prepared.state).toBe('record-plan-only');
  expect(prepared.record.qualificationDigest).toBe(hashValue(row.qualification));
  row.setExisting({
    targetCommit: row.environment.GITHUB_SHA,
    message: JSON.stringify(prepared.record),
  });
  expect((await prepareCurrentAppRecord(row.root, row.environment, row.io)).state).toBe('recorded');
});
it.each([undefined, 'not-a-date', '2026-10-29T01:59:59Z', '2026-10-31T02:01:00Z'])(
  'refuses missing, prequalification or future actual deployment clock %s',
  async (createdAt) => {
    const row = await setup();
    row.setDeploymentClock(createdAt);
    await expect(
      verifyCurrentPublicDeployment(row.root, row.environment, row.io),
    ).rejects.toThrow();
  },
);
