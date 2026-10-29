// @vitest-environment node
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { gitFixtureEnvironment } from './gitFixture';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'content-original-'));
  roots.push(root);
  const metadata = {
    schemaVersion: 1,
    courseId: 'future-topic',
    lessonId: 'lesson',
    learnerDigest: 'a'.repeat(64),
    sourceCommit: '1'.repeat(40),
    authorId: 'author',
    actorId: 'novice-actor',
    role: 'novice',
    method: 'agent-ui',
    status: 'approved',
    accuracy: 'approved',
    goalExerciseAlignment: 'approved',
    unexplainedTerms: 0,
    hintLeakage: 0,
    examplesExecuted: false,
    session: 'private-session-a',
    context: 'private-context-a',
  };
  const original = {
    ...metadata,
    observationKind: 'independent-content-observation',
    unresolvedCritical: 0,
    unresolvedImportant: 0,
    requiredUnconfirmed: 0,
    privateNotes: 'synthetic private source response; must never be in CI receipt',
  };
  const bytes = Buffer.from(JSON.stringify(original));
  await writeFile(path.join(root, 'original.json'), bytes, { mode: 0o600 });
  const source = {
    sourceCommit: metadata.sourceCommit,
    inventory: {
      schemaVersion: 1,
      fingerprintVersion: 1,
      courses: [
        {
          id: metadata.courseId,
          revision: '1',
          publicationStatus: 'published',
          runner: 'html-css',
          lessons: [
            {
              id: metadata.lessonId,
              kind: 'standard',
              learnerDigest: metadata.learnerDigest,
              exerciseDigest: 'b'.repeat(64),
              navigationDigest: 'c'.repeat(64),
              persistenceDigest: 'd'.repeat(64),
              exercises: [],
            },
          ],
        },
      ],
    },
  };
  return {
    root,
    metadata,
    original,
    source,
    reference: { path: 'original.json', sha256: hashBytes(bytes), bytes: bytes.length },
  };
}
it('reads the exact independent original without copying private notes or paths into the receipt', async () => {
  const { inspectContentOriginal, readContentReceiptFile } =
    await import('../../../../scripts/release/v2/contentOriginals');
  const row = await setup();
  const receipt = await inspectContentOriginal(
    row.root,
    row.reference,
    row.metadata,
    'independent-inspector',
    row.source,
  );
  expect(receipt).toMatchObject({
    ...row.metadata,
    originalDigest: row.reference.sha256,
    originalsCheckedBy: 'independent-inspector',
  });
  expect(JSON.stringify(receipt)).not.toContain(row.original.privateNotes);
  expect(JSON.stringify(receipt)).not.toContain('original.json');
  const { receiptDigest, ...unsigned } = receipt;
  expect(receiptDigest).toBe(hashValue(unsigned));
  const file = path.join(row.root, 'sidecar.json');
  await writeFile(file, JSON.stringify({ schemaVersion: 1, receipts: [receipt] }));
  expect(await readContentReceiptFile(file)).toEqual([receipt]);
  await writeFile(
    file,
    JSON.stringify({ schemaVersion: 1, receipts: [{ ...receipt, actorId: 'forged' }] }),
  );
  await expect(readContentReceiptFile(file)).rejects.toThrow(/digest/iu);
});
it.each([
  'missing',
  'changed',
  'symlink',
  'outside',
  'wrong-scope',
  'pending',
  'self-review',
  'machine-method',
  'wrong-source',
  'stale-digest',
])('refuses %s original before issuing a receipt', async (kind) => {
  const { inspectContentOriginal } =
    await import('../../../../scripts/release/v2/contentOriginals');
  const row = await setup();
  let inspector = 'independent-inspector';
  if (kind === 'missing') await rm(path.join(row.root, 'original.json'));
  if (kind === 'changed') await writeFile(path.join(row.root, 'original.json'), 'changed');
  if (kind === 'symlink') {
    await symlink('original.json', path.join(row.root, 'link.json'));
    row.reference.path = 'link.json';
  }
  if (kind === 'outside') row.reference.path = '../original.json';
  if (kind === 'wrong-scope') row.metadata.lessonId = 'other-lesson';
  if (kind === 'self-review') inspector = row.metadata.actorId;
  if (kind === 'wrong-source') row.source.sourceCommit = '2'.repeat(40);
  if (kind === 'stale-digest')
    row.source.inventory.courses[0]!.lessons[0]!.learnerDigest = '2'.repeat(64);
  if (kind === 'pending' || kind === 'machine-method') {
    const original = {
      ...row.original,
      ...(kind === 'pending' ? { requiredUnconfirmed: 1 } : { method: 'automatic-test' }),
    };
    const bytes = Buffer.from(JSON.stringify(original));
    await writeFile(path.join(row.root, 'original.json'), bytes);
    row.reference.sha256 = hashBytes(bytes);
    row.reference.bytes = bytes.length;
  }
  await expect(
    inspectContentOriginal(row.root, row.reference, row.metadata, inspector, row.source),
  ).rejects.toThrow();
});
it('reads an actual immutable Git source inventory and refuses an unavailable source', async () => {
  const { readInventoryAtSource } = await import('../../../../scripts/release/v2/sourceInventory');
  const { execFileSync } = await import('node:child_process');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const result = await readInventoryAtSource(process.cwd(), source, 'html-css');
  expect(result.sourceCommit).toBe(source);
  const { readVerifiedContentPolicy } =
    await import('../../../../scripts/release/v2/contentOriginals');
  const policyRoot = await mkdtemp(path.join(os.tmpdir(), 'content-policy-source-'));
  roots.push(policyRoot);
  const policyFile = path.join(policyRoot, 'policy.json');
  const lesson = result.inventory.courses[0]!.lessons[0]!;
  const withdrawal = {
    courseId: 'html-css',
    lessonId: lesson.id,
    learnerDigest: lesson.learnerDigest,
    sourceCommit: source,
    reason: 'known-finding',
  };
  await writeFile(
    policyFile,
    JSON.stringify({ schemaVersion: 1, receipts: [], withdrawals: [withdrawal] }),
  );
  expect((await readVerifiedContentPolicy(process.cwd(), policyFile)).withdrawals).toEqual([
    withdrawal,
  ]);
  await writeFile(
    policyFile,
    JSON.stringify({
      schemaVersion: 1,
      receipts: [],
      withdrawals: [{ ...withdrawal, learnerDigest: '0'.repeat(64) }],
    }),
  );
  await expect(readVerifiedContentPolicy(process.cwd(), policyFile)).rejects.toThrow(
    /source differs/,
  );

  // The real workspace metadata is intentionally read-only in CI. Create synthetic objects only
  // in a private repository; shared object data is read-only and no foreign config is loaded.
  const root = await mkdtemp(path.join(os.tmpdir(), 'content-source-git-'));
  roots.push(root);
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
  const gitEnvironment = gitFixtureEnvironment();
  execFileSync('git', ['init', '-b', 'main', root], { env: gitEnvironment });
  await writeFile(
    path.join(root, '.git/objects/info/alternates'),
    path.join(common, 'objects') + '\n',
  );
  execFileSync('git', ['checkout', '--detach', source], { cwd: root, env: gitEnvironment });
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: root,
    env: gitEnvironment,
    encoding: 'utf8',
  }).trim();
  const independentSource = execFileSync(
    'git',
    ['commit-tree', tree, '-m', 'synthetic non-ancestor Source test'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...gitEnvironment,
        GIT_AUTHOR_NAME: 'Synthetic fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Synthetic fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      },
    },
  ).trim();
  const rebased = await readInventoryAtSource(root, independentSource, 'html-css');
  expect(rebased.sourceCommit).toBe(independentSource);
  expect(rebased.inventory).toEqual(result.inventory);
  expect(result.inventory.courses.length).toBeGreaterThan(0);
  expect(
    result.inventory.courses.every((row) =>
      row.lessons.every((lesson) => /^[a-f0-9]{64}$/u.test(lesson.learnerDigest)),
    ),
  ).toBe(true);
  await expect(readInventoryAtSource(process.cwd(), '0'.repeat(40), 'html-css')).rejects.toThrow();
}, 60000);
