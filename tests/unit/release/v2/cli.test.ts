// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
/** 旧台帳の判定を実compilerへ接続する、2コース各1Lessonの合成入力。 */
async function writeShadowFixture(
  root: string,
  pythonAccuracy: 'approved' | 'rejected',
): Promise<void> {
  const sourceRoot = path.join(root, 'content');
  await cp(path.resolve('tests/fixtures/foundation-content'), sourceRoot, { recursive: true });
  await cp(path.join(sourceRoot, 'html-css'), path.join(sourceRoot, 'python-basics'), {
    recursive: true,
  });
  const coursePath = path.join(sourceRoot, 'python-basics/course.yaml');
  await writeFile(
    coursePath,
    (await readFile(coursePath, 'utf8')).replace('id: html-css', 'id: python-basics'),
  );
  // python-basicsという歴史IDだけを使うHTML fixture。Python実行器の検査ではない。
  const { computeLessonSourceHash } =
    await import('../../../../scripts/content/verifyContentReview');
  const quality = path.join(root, 'docs/quality');
  await mkdir(quality, { recursive: true });
  for (const [courseId, reviewName, approvalName, accuracy] of [
    ['html-css', 'content-review.yaml', 'release-approval.yaml', 'approved'],
    [
      'python-basics',
      'content-review-python-basics.yaml',
      'python-release-approval.yaml',
      pythonAccuracy,
    ],
  ] as const) {
    const hash = await computeLessonSourceHash(
      path.join(sourceRoot, courseId, 'chapters/ch00-web-map/lessons/lesson-first-heading'),
    );
    await writeFile(
      path.join(quality, reviewName),
      `schemaVersion: 1
releaseStatus: draft
verifiedSourceCommit: draft
canonicalDistSha256: draft
lessons:
  - lessonId: lesson-first-heading
    sourceHash: "${hash}"
    authorId: fixture-original-author
    reviewerId: fixture-independent-reviewer
    accuracy: ${accuracy}
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
`,
    );
    await writeFile(
      path.join(quality, approvalName),
      courseId === 'python-basics'
        ? `status: approved\nverifiedSourceCommit: ${'a'.repeat(40)}\n`
        : 'status: draft\nverifiedSourceCommit: draft\n',
    );
  }
}
describe('release v2 command boundary', () => {
  it('writes a real manifest-derived shadow report with old record states and no new approvals', async () => {
    const compiler = await import('../../../../scripts/content/compile');
    const actualCompile = compiler.compileContent;
    const compile = vi.spyOn(compiler, 'compileContent').mockImplementation((options) => {
      if (!options.checkOnly) throw new Error('Shadow must not stage unused generated artifacts');
      return actualCompile(options);
    });
    const { runCli } = await import('../../../../scripts/release/v2/cli');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-cli-'));
    roots.push(root);
    const output = path.join(root, 'shadow.json');
    await runCli(['shadow', '--root', process.cwd(), '--output', output]);
    expect(compile).toHaveBeenCalledTimes(1);
    const report = JSON.parse(await readFile(output, 'utf8')) as {
      status: string;
      inventory: {
        courses: { id: string; publicationStatus: string; lessons: unknown[] }[];
      };
      shadow: {
        courses: {
          courseId: string;
          contentRows: string;
          publication: string;
          learnerApproval: string;
          currentDeployment: string;
        }[];
      };
    };
    expect(report.status).toBe('shadow-only');
    expect(report.inventory.courses.some((course) => course.id === 'python-basics')).toBe(true);
    const pythonPractice = report.inventory.courses.filter(
      (course) => course.id === 'python-practice',
    );
    expect(pythonPractice).toHaveLength(1);
    expect(pythonPractice[0]).toMatchObject({ publicationStatus: 'published' });
    const coursesWithoutLegacyRecords = ['python-practice', 'tailwind'];
    const publishedWithoutLegacyRecords = report.inventory.courses
      .filter(
        (course) =>
          course.publicationStatus === 'published' && coursesWithoutLegacyRecords.includes(course.id),
      )
      .map((course) => course.id);
    expect(
      report.shadow.courses
        .filter((course) => course.contentRows !== 'valid')
        .map((course) => course.courseId),
    ).toEqual(publishedWithoutLegacyRecords);
    for (const courseId of publishedWithoutLegacyRecords) {
      // Bounded historical receipts are separate from legacy-record shadow diagnostics.
      expect(report.shadow.courses.find((course) => course.courseId === courseId)).toMatchObject({
        contentRows: 'missing',
        publication: 'unknown',
        learnerApproval: 'new-evidence-required',
        currentDeployment: 'unverified',
      });
    }
    expect(
      report.shadow.courses.find((course) => course.courseId === 'html-css')!.publication,
    ).toBe('pending');
    expect(
      report.shadow.courses.find((course) => course.courseId === 'python-basics')!.publication,
    ).toBe('recorded-approved-unbound');
    expect(
      report.shadow.courses.find((course) => course.courseId === 'python-basics')!
        .currentDeployment,
    ).toBe('unverified');
  }, 90_000);
  it.each([
    { pythonAccuracy: 'approved', invalidCourses: [] },
    { pythonAccuracy: 'rejected', invalidCourses: ['python-basics'] },
  ] as const)(
    'writes a real shadow report without new approvals: $pythonAccuracy',
    async ({ pythonAccuracy, invalidCourses }) => {
      const compiler = await import('../../../../scripts/content/compile');
      const actualCompile = compiler.compileContent;
      const compile = vi.spyOn(compiler, 'compileContent').mockImplementation((options) => {
        if (!options.checkOnly) throw new Error('Shadow must not stage unused generated artifacts');
        return actualCompile(options);
      });
      const { runCli } = await import('../../../../scripts/release/v2/cli');
      const root = await mkdtemp(path.join(os.tmpdir(), 'release-cli-'));
      roots.push(root);
      const output = path.join(root, 'shadow.json');
      await writeShadowFixture(root, pythonAccuracy);
      await runCli(['shadow', '--root', root, '--output', output]);
      expect(compile).toHaveBeenCalledTimes(1);
      const report = JSON.parse(await readFile(output, 'utf8')) as {
        status: string;
        inventory: { courses: { id: string; lessons: unknown[] }[] };
        shadow: {
          courses: {
            courseId: string;
            contentRows: string;
            publication: string;
            learnerApproval: string;
            currentDeployment: string;
          }[];
        };
      };
      expect(report.status).toBe('shadow-only');
      expect(report.inventory.courses.map((course) => course.id)).toEqual([
        'html-css',
        'python-basics',
      ]);
      expect(report.inventory.courses.every((course) => course.lessons.length === 1)).toBe(true);
      expect(
        report.shadow.courses.every(
          (course) =>
            course.learnerApproval === 'historical-only' &&
            course.currentDeployment === 'unverified',
        ),
      ).toBe(true);
      await expect(
        readFile(path.join(root, 'public/generated/content/catalog-v3.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      expect(
        report.shadow.courses
          .filter((course) => course.contentRows !== 'valid')
          .map((course) => course.courseId),
      ).toEqual(invalidCourses);
      expect(
        report.shadow.courses.find((course) => course.courseId === 'html-css')!.publication,
      ).toBe('pending');
      expect(
        report.shadow.courses.find((course) => course.courseId === 'python-basics')!.publication,
      ).toBe('recorded-approved-unbound');
      expect(
        report.shadow.courses.find((course) => course.courseId === 'python-basics')!
          .currentDeployment,
      ).toBe('unverified');
    },
    90_000,
  );
  it('refuses unknown commands, options, missing output and existing output ownership', async () => {
    const { runCli } = await import('../../../../scripts/release/v2/cli');
    await expect(runCli(['deploy'])).rejects.toThrow();
    await expect(runCli(['shadow', '--raw-original', 'secret'])).rejects.toThrow();
    await expect(runCli(['shadow'])).rejects.toThrow();
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-cli-owner-'));
    roots.push(root);
    const output = path.join(root, 'owned.json');
    await writeFile(output, 'already-owned');
    await expect(runCli(['shadow', '--root', process.cwd(), '--output', output])).rejects.toThrow();
    expect(await readFile(output, 'utf8')).toBe('already-owned');
  });
});

it('blocks withdrawn content before build and stages the complete verified policy when permitted', async () => {
  const { hashValue } = await import('../../../../scripts/release/v2/identity');
  const { planRelease } = await import('../../../../scripts/release/v2/plan');
  const originals = await import('../../../../scripts/release/v2/contentOriginals');
  const { runCli } = await import('../../../../scripts/release/v2/cli');
  const inventory = {
    schemaVersion: 1 as const,
    fingerprintVersion: 1 as const,
    courses: [
      {
        id: 'topic',
        revision: '1',
        publicationStatus: 'published' as const,
        runner: 'html-css' as const,
        lessons: [
          {
            id: 'lesson',
            kind: 'standard' as const,
            learnerDigest: 'a'.repeat(64),
            exerciseDigest: 'b'.repeat(64),
            navigationDigest: 'c'.repeat(64),
            persistenceDigest: 'd'.repeat(64),
            exercises: [],
          },
        ],
      },
    ],
  };
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
    deploymentId: proof.deploymentId,
    sourceCommit: proof.sourceCommit,
    artifactDigest: proof.artifactDigest,
    sourceRecordDigest: hashValue(proof),
    inventory,
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'content-early-gate-'));
  roots.push(root);
  await mkdir(path.join(root, '.release-v2'));
  await writeFile(
    path.join(root, '.release-v2/preparation.json'),
    JSON.stringify({ schemaVersion: 1, inventory, plan: planRelease(inventory, baseline) }),
  );
  await writeFile(
    path.join(root, '.release-v2/baseline.json'),
    JSON.stringify({ baseline, proof }),
  );
  const policy = {
    schemaVersion: 1 as const,
    receipts: [],
    withdrawals: [
      {
        courseId: 'topic',
        lessonId: 'lesson',
        learnerDigest: 'a'.repeat(64),
        sourceCommit: proof.sourceCommit,
        reason: 'known-finding' as const,
      },
    ],
  };
  // Source-archive verification has separate real-Git tests; this test exercises the actual CLI gate.
  const reader = vi.spyOn(originals, 'readVerifiedContentPolicy').mockResolvedValue(policy);
  const output = path.join(root, '.release-v2/content-receipts.json');
  await expect(runCli(['stage-content', '--root', root, '--output', output])).rejects.toThrow(
    /withdraw/i,
  );
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
  reader.mockResolvedValue({ ...policy, withdrawals: [] });
  await runCli(['stage-content', '--root', root, '--output', output]);
  expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({ ...policy, withdrawals: [] });
});

it('routes public observation and record planning to read-only services and preserves exact output ownership', async () => {
  const service = await import('../../../../scripts/release/v2/publicationService');
  const { runCli } = await import('../../../../scripts/release/v2/cli');
  const smoke = {
    schemaVersion: 1 as const,
    status: 'passed' as const,
    candidateDigest: 'a'.repeat(64),
    artifactDigest: 'b'.repeat(64),
    actual: {
      repository: 'owner/site',
      deploymentId: '501',
      workflowHeadCommit: '1'.repeat(40),
      runId: '101',
      siteUrl: 'https://owner.github.io/site/',
      createdAt: '2026-10-29T02:59:00Z',
    },
    checkedFiles: 1,
    observedAt: '2026-10-29T03:00:00Z',
  };
  const observe = vi.spyOn(service, 'verifyCurrentPublicDeployment').mockResolvedValue(smoke);
  const root = await mkdtemp(path.join(os.tmpdir(), 'public-observation-cli-'));
  roots.push(root);
  const environment = { GITHUB_JOB: 'report' };
  const output = path.join(root, 'smoke.json');
  await runCli(['public-smoke', '--root', root, '--output', output], environment);
  expect(observe).toHaveBeenCalledWith(root, environment);
  expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(smoke);
  await expect(
    runCli(['public-smoke', '--root', root, '--output', output], environment),
  ).rejects.toThrow(/exists/);
  expect(observe).toHaveBeenCalledTimes(1);
  const plan = vi
    .spyOn(service, 'prepareCurrentAppRecord')
    .mockRejectedValue(Error('synthetic unsafe actual deployment'));
  await expect(
    runCli(
      ['record-plan', '--root', root, '--output', path.join(root, 'record.json')],
      environment,
    ),
  ).rejects.toThrow(/unsafe/);
  expect(plan).toHaveBeenCalledWith(root, environment);
  await expect(readFile(path.join(root, 'record.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});
