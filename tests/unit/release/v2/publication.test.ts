// @vitest-environment node
import { expect, it } from 'vitest';
import { syntheticPublishedOperations } from './releaseFixture';
import { hashValue, hashBytes } from '../../../../scripts/release/v2/identity';
import { BuildIdentitySchema, InventorySchema } from '../../../../scripts/release/v2/schema';
import { parseAppBinding } from '../../../../scripts/release/v2/appRecord';
const data = new TextEncoder().encode('fixed app bytes');
const artifact = {
  files: [{ path: 'index.html', bytes: data.length, sha256: hashBytes(data) }],
  digest: '',
};
artifact.digest = hashValue(artifact.files);
const candidate = BuildIdentitySchema.parse({
  schemaVersion: 1,
  repository: 'owner/site',
  runId: '101',
  buildJobId: 'build',
  buildAttempt: 1,
  artifactDigest: artifact.digest,
  artifactId: '301',
  planDigest: 'b'.repeat(64),
  recipe: {
    sourceCommit: '1'.repeat(40),
    sourceTree: '2'.repeat(40),
    lockDigest: 'c'.repeat(64),
    workflowDigest: 'd'.repeat(64),
    policyDigest: 'e'.repeat(64),
    toolchain: 'node-fixed',
    basePath: '/site/',
  },
});
const actual = {
  repository: 'owner/site',
  deploymentId: '501',
  workflowHeadCommit: '3'.repeat(40),
  runId: '101',
  siteUrl: 'https://owner.github.io/site/',
  createdAt: '2026-10-28T21:00:30Z',
};
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
const qualification = {
  schemaVersion: 1,
  status: 'qualified',
  candidateDigest: hashValue(candidate),
  qualifiedAt: '2026-10-28T21:00:00.000Z',
  parent: null,
  technical: {
    status: 'technical-passed',
    expiresAt: '2026-10-30T21:00:00Z',
    candidateDigest: hashValue(candidate),
    buildAttempt: 1,
    verificationAttempts: [1],
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
it('matches all public bytes and rechecks actual deployment before generating a verified source record', async () => {
  const { verifyPublicDeployment, createVerifiedAppRecord, planAppRecordRecovery } =
    await import('../../../../scripts/release/v2/publication');
  let reads = 0;
  const smoke = await verifyPublicDeployment(
    candidate,
    artifact,
    async () => {
      reads++;
      return actual;
    },
    async () => data,
    '2026-10-28T21:01:00.000Z',
  );
  expect(reads).toBe(2);
  const operations = await syntheticPublishedOperations(
    candidate,
    inventory,
    actual,
    '2026-10-28T21:01:00.000Z',
  );
  const record = createVerifiedAppRecord(
    candidate,
    { inventory, publicContent: artifact },
    qualification,
    smoke,
    actual,
    '2026-10-28T21:02:00.000Z',
    operations,
  );
  expect(
    parseAppBinding(JSON.stringify(record), candidate.recipe.sourceCommit, actual).artifactDigest,
  ).toBe(artifact.digest);
  const action = planAppRecordRecovery(record, actual, undefined);
  expect(action).toMatchObject({
    action: 'create-annotated-record',
    targetCommit: candidate.recipe.sourceCommit,
  });
  expect(
    planAppRecordRecovery({ ...record, observedAt: '2026-10-28T21:03:00.000Z' }, actual, {
      targetCommit: candidate.recipe.sourceCommit,
      message: JSON.stringify(record),
    }),
  ).toMatchObject({ action: 'reuse-record' });
});
it.each(['bytes', 'size', 'moved', 'run', 'repository', 'url', 'path', 'candidate'])(
  'refuses public %s mismatch',
  async (kind) => {
    const { verifyPublicDeployment } = await import('../../../../scripts/release/v2/publication');
    let reads = 0;
    const modified = structuredClone(artifact);
    let bytes = data;
    const observed = { ...actual };
    if (kind === 'bytes') bytes = new TextEncoder().encode('wrong app bytes');
    if (kind === 'size') bytes = new Uint8Array(0);
    if (kind === 'run') observed.runId = '102';
    if (kind === 'repository') observed.repository = 'owner/other';
    if (kind === 'url') observed.siteUrl = 'https://evil.invalid/';
    if (kind === 'path') {
      modified.files[0]!.path = '../private';
      modified.digest = hashValue(modified.files);
    }
    const changedCandidate =
      kind === 'path'
        ? { ...candidate, artifactDigest: modified.digest }
        : kind === 'candidate'
          ? { ...candidate, artifactDigest: 'f'.repeat(64) }
          : candidate;
    await expect(
      verifyPublicDeployment(
        changedCandidate,
        modified,
        async () => {
          reads++;
          return kind === 'moved' && reads === 2 ? { ...observed, deploymentId: '502' } : observed;
        },
        async () => bytes,
        '2026-10-28T21:01:00.000Z',
      ),
    ).rejects.toThrow();
  },
);
it.each([
  'candidate',
  'qualification',
  'failed-quality',
  'missing-quality',
  'smoke',
  'digest',
  'clock',
  'expired',
  'tag-source',
  'tag-content',
])('never overwrites a %s conflict or creates a fake successful record', async (kind) => {
  const { verifyPublicDeployment, createVerifiedAppRecord, planAppRecordRecovery } =
    await import('../../../../scripts/release/v2/publication');
  const smoke = await verifyPublicDeployment(
    candidate,
    artifact,
    async () => actual,
    async () => data,
    '2026-10-28T21:01:00.000Z',
  );
  const q = structuredClone(qualification),
    s = structuredClone(smoke);
  let c = candidate;
  if (kind === 'expired') q.technical.expiresAt = '2026-10-28T21:00:20Z';
  if (kind === 'failed-quality') q.technical.status = 'failed';
  if (kind === 'missing-quality') q.technical.suites = [];
  if (kind === 'candidate') c = { ...candidate, runId: '102' };
  if (kind === 'qualification') q.candidateDigest = 'f'.repeat(64);
  if (kind === 'smoke') s.actual.deploymentId = '502';
  if (kind === 'digest') s.artifactDigest = 'f'.repeat(64);
  const operations = await syntheticPublishedOperations(
    candidate,
    inventory,
    actual,
    '2026-10-28T21:01:00.000Z',
  );
  if (kind.startsWith('tag-')) {
    const record = createVerifiedAppRecord(
      c,
      { inventory, publicContent: artifact },
      q,
      s,
      actual,
      '2026-10-28T21:02:00.000Z',
      operations,
    );
    const other = { ...record, qualificationDigest: 'f'.repeat(64) };
    expect(() =>
      planAppRecordRecovery(record, actual, {
        targetCommit: kind === 'tag-source' ? '4'.repeat(40) : candidate.recipe.sourceCommit,
        message: JSON.stringify(other),
      }),
    ).toThrow();
  } else
    expect(() =>
      createVerifiedAppRecord(
        c,
        { inventory, publicContent: artifact },
        q,
        s,
        actual,
        kind === 'clock' ? '2026-10-28T20:00:00.000Z' : '2026-10-28T21:02:00.000Z',
        operations,
      ),
    ).toThrow();
});

it('does not issue a verified app record from byte-only post-deploy evidence', async () => {
  const { verifyPublicDeployment, createVerifiedAppRecord } =
    await import('../../../../scripts/release/v2/publication');
  const byteSmoke = await verifyPublicDeployment(
    candidate,
    artifact,
    async () => actual,
    async () => data,
    '2026-10-28T21:01:00.000Z',
  );
  expect(() =>
    createVerifiedAppRecord(
      candidate,
      { inventory, publicContent: artifact },
      qualification,
      byteSmoke,
      actual,
      '2026-10-28T21:02:00.000Z',
    ),
  ).toThrow(/operation|public UI|observation/i);
});

it.each([
  'same-deployment',
  'expired-at-deployment',
  'before-qualification',
  'future-deployment',
  'smoke-before-deployment',
  'operations-before-deployment',
  'missing-clock',
])('permits late record recovery only for a valid actual deployment clock: %s', async (kind) => {
  const { createVerifiedAppRecord } = await import('../../../../scripts/release/v2/publication');
  const deployed = { ...actual };
  const q = structuredClone(qualification);
  q.technical.expiresAt = '2026-10-28T22:00:00Z';
  if (kind === 'expired-at-deployment') q.technical.expiresAt = '2026-10-28T21:00:20Z';
  if (kind === 'before-qualification') deployed.createdAt = '2026-10-28T20:59:59Z';
  if (kind === 'future-deployment') {
    deployed.createdAt = '2026-10-30T21:00:00Z';
    q.technical.expiresAt = '2026-10-31T21:00:00Z';
  }
  const observedAt = '2026-10-29T21:00:00Z';
  const smoke = {
    schemaVersion: 1,
    status: 'passed',
    candidateDigest: hashValue(candidate),
    artifactDigest: candidate.artifactDigest,
    actual: deployed,
    checkedFiles: 1,
    observedAt: kind === 'smoke-before-deployment' ? '2026-10-28T21:00:10Z' : observedAt,
  };
  const operations = await syntheticPublishedOperations(candidate, inventory, deployed, observedAt);
  if (kind === 'operations-before-deployment') operations.observedAt = '2026-10-28T21:00:10Z';
  const actualInput =
    kind === 'missing-clock'
      ? Object.fromEntries(Object.entries(deployed).filter(([key]) => key !== 'createdAt'))
      : deployed;
  const call = () =>
    createVerifiedAppRecord(
      candidate,
      { inventory, publicContent: artifact },
      q,
      smoke,
      actualInput,
      observedAt,
      operations,
    );
  if (kind === 'same-deployment')
    expect(call()).toMatchObject({ state: 'verified', qualificationDigest: hashValue(q) });
  else expect(call).toThrow();
});
