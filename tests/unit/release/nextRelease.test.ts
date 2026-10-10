// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCourse } from '../../../scripts/content/compileCourse';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import type { CourseManifest } from '../../../src/core/content/types';
import { sha256Text } from '../../../scripts/release/releaseHashes';
import { verifyNextSyntheticProgressBundle } from '../../../scripts/release/nextSyntheticContinuity';
import {
  createNextInputManifest,
  compareNextLearningInputs,
  isNextLearningInput,
} from '../../../scripts/release/nextInputHashes';
import { parseCourseReleaseHistory } from '../../../scripts/release/javascriptReleaseSchema';
import { parse } from 'yaml';
import {
  hashNextReleaseEvidence,
  validateNextReleaseEvidence,
  NEXT_ACCEPTANCE_LESSONS,
  type NextReleaseEvidence,
} from '../../../scripts/release/verifyNextQualityEvidence';

const encode = (value: string) => new TextEncoder().encode(value);
let course: CourseManifest;
let bundle: Record<string, unknown>;
beforeAll(async () => {
  course = (await compileCourse('content/next')).runtime;
  bundle = JSON.parse(
    await readFile('tests/fixtures/progress/next-previous-release-bundle.json', 'utf8'),
  ) as Record<string, unknown>;
});

/** 変更した合成値の整合hashを更新し、hash不一致以外の欠落検出を確認する。 */
function sign(value: Record<string, unknown>) {
  Reflect.deleteProperty(value, 'integrity');
  return {
    ...value,
    integrity: { algorithm: 'SHA-256', digest: sha256Text(canonicalJson(value)) },
  };
}

describe('Next初公開の保存互換', () => {
  it('独立9Workspaceと3工程履歴を実migratorで保持する', async () => {
    expect(await verifyNextSyntheticProgressBundle(course, bundle)).toMatchObject({
      migratedCourses: 5,
      resetNotices: 0,
    });
  });
  it.each(['Workspace', 'Source', '工程履歴', '成功snapshot', '既存Course'] as const)(
    '%sの欠落を正しい整合hashでも拒否する',
    async (kind) => {
      const copy = structuredClone(bundle) as {
        drafts: Record<string, Record<string, unknown>>;
        courses: Record<string, unknown>;
      };
      const draft = copy.drafts['next:next-ch05-l01-e01']!;
      if (kind === 'Workspace') Reflect.deleteProperty(copy.drafts, 'next:next-ch05-l01-e01');
      if (kind === 'Source') draft.files = {};
      if (kind === '工程履歴')
        draft.validationHistory = (draft.validationHistory as unknown[]).slice(-1);
      if (kind === '成功snapshot') draft.lastPassingSnapshots = {};
      if (kind === '既存Course') Reflect.deleteProperty(copy.courses, 'react');
      await expect(verifyNextSyntheticProgressBundle(course, sign(copy))).rejects.toThrow();
    },
  );
  it('未承認draft台帳を既存Courseと同じstrict parserで読める', async () => {
    const history = parseCourseReleaseHistory(
      'next',
      parse(await readFile('content/next/release-history.yaml', 'utf8')),
    );
    expect(history.candidate.status).toBe('draft');
    expect(history.releases).toEqual([]);
  });
});

async function inputs() {
  const files = new Map<string, Uint8Array>(
    await Promise.all(
      [
        'content/next/course.yaml',
        'content/learning-paths/frontend.yaml',
        'package.json',
        'package-lock.json',
      ].map(async (relative) => [relative, await readFile(relative)] as const),
    ),
  );
  const courseSource = new TextDecoder().decode(files.get('content/next/course.yaml'));
  const pathSource = new TextDecoder().decode(files.get('content/learning-paths/frontend.yaml'));
  const step = '  - courseId: next\n    role: required\n    prerequisiteCourseIds: [react]\n';
  files.set(
    'content/next/course.yaml',
    encode(courseSource.replace('publicationStatus: published', 'publicationStatus: draft')),
  );
  files.set('content/learning-paths/frontend.yaml', encode(pathSource.replace(step, '')));
  const draft = createNextInputManifest('a'.repeat(40), files);
  files.set(
    'content/next/course.yaml',
    encode(courseSource.replace('publicationStatus: draft', 'publicationStatus: published')),
  );
  files.set('content/learning-paths/frontend.yaml', encode(pathSource.replace(step, '') + step));
  return { draft, files, final: createNextInputManifest('b'.repeat(40), files) };
}

describe('Nextの公開入力', () => {
  it('Course公開状態とReact直後のrequired登録だけを許可する', async () => {
    const { draft, final } = await inputs();
    expect(() => compareNextLearningInputs(draft, final)).not.toThrow();
  });
  it('metadata変更に混ぜた教材文面変更を拒否する', async () => {
    const { draft, files } = await inputs();
    files.set(
      'content/next/course.yaml',
      encode(
        new TextDecoder()
          .decode(files.get('content/next/course.yaml'))
          .replace('estimatedMinutes: 345', 'estimatedMinutes: 346'),
      ),
    );
    expect(() =>
      compareNextLearningInputs(draft, createNextInputManifest('b'.repeat(40), files)),
    ).toThrow();
  });
  it.each([
    'tests/content/next.test.ts',
    'tests/unit/release/nextRelease.test.ts',
    'scripts/release/verifyNextNativeCi.mjs',
  ])('検査入力%sを除外しない', (relative) => {
    expect(isNextLearningInput(relative)).toBe(true);
  });
});

/** Source・Artifact・独立原本照合の拒否ケース専用。実受入の証拠として使用しない。 */
async function evidence(): Promise<NextReleaseEvidence> {
  const input = await inputs();
  const hash = 'a'.repeat(64);
  const reference = (index: number) => ({
    path: `private/test-${String(index)}.json`,
    sha256: String(index).repeat(64),
  });
  const nativePreflight: NextReleaseEvidence['nativePreflight'] = {
    schemaVersion: 1,
    courseId: 'next',
    sourceCommit: input.draft.sourceCommit,
    workflowRunId: '123',
    workflowRunAttempt: 1,
    scope: '9教材81Fixtureのcheckpoint。通常UIの連続監視ではありません。',
    workspaces: NEXT_ACCEPTANCE_LESSONS.map((id, index) => ({
      workspaceId: `${id}-e01`,
      fixtureCount: [6, 8, 9, 8, 9, 9, 9, 11, 12][index]!,
      limitMiB: [512, 576, 512, 576, 576, 512, 512, 896, 896][index]!,
      peakBytes: 100,
      maximumPids: 5,
      memoryEvents: { max: 0, oom: 0, oomKill: 0 },
      zombies: 0,
    })),
  };
  const record: NextReleaseEvidence = {
    schemaVersion: 1,
    courseId: 'next',
    status: 'preflight-passed-final-ci-required',
    publicationApprovalReference: 'unit-test-only',
    realHumanTrial: 'unverified',
    lowEndPhysicalDevice: 'unverified',
    cookieAuthenticationPersistence: 'unsupported-deferred-issue-14',
    verifiedSourceCommit: input.final.sourceCommit,
    canonicalDistSha256: hash,
    candidateTreeSha256: hash,
    draftCanonicalDistSha256: hash,
    draftInput: input.draft,
    finalInput: input.final,
    applicationSourceSha256: hash,
    dependencyLockSha256: hash,
    personas: (['learner', 'learning-design', 'runtime-publication'] as const).map(
      (role, index) => ({
        role,
        actor: `reviewer-${String(index)}`,
        session: `session-${String(index)}`,
        method: 'independent-ai-source-review',
        mandatoryFindings: 0,
        report: reference(index + 1),
        lessons: NEXT_ACCEPTANCE_LESSONS.map((lessonId) => ({
          lessonId,
          learnerContentSha256: hash,
        })),
      }),
    ),
    nativePreflight,
    nativeEvidence: {
      path: 'private/native.json',
      sha256: sha256Text(JSON.stringify(nativePreflight, null, 2) + '\n'),
    },
    pagesStaticStudy: {
      sourceCommit: input.final.sourceCommit,
      canonicalDistSha256: hash,
      viewports: [1280, 390],
      lessonIds: [...NEXT_ACCEPTANCE_LESSONS],
      axeViolations: 0,
      localExecutionRequests: 0,
      serverExecution: 'not-provided-on-pages',
      progressRoundTrip: 'passed',
      localHandoff: 'passed',
      report: reference(5),
    },
    author: 'author',
    privateOriginalsChecked: true,
    independenceReview: {
      reviewer: 'reviewer-2',
      status: 'approved',
      sourceCommit: input.final.sourceCommit,
      canonicalDistSha256: hash,
      productTreeSha256: hash,
      evidenceSha256: hash,
      referenceSha256s: [],
    },
  };
  record.independenceReview.referenceSha256s = [
    ...record.personas.map(({ report }) => report.sha256),
    record.nativeEvidence.sha256,
    record.pagesStaticStudy.report.sha256,
  ];
  record.independenceReview.evidenceSha256 = hashNextReleaseEvidence(record);
  return record;
}

describe('Nextの独立証拠binding', () => {
  const hashes = new Map(NEXT_ACCEPTANCE_LESSONS.map((id) => [id, 'a'.repeat(64)]));
  it('9教材・81実測・3独立読解と未確認の範囲を保持する', async () => {
    expect(validateNextReleaseEvidence(await evidence(), hashes).realHumanTrial).toBe('unverified');
  });
  it.each([
    '原本差替え',
    '未確認を合格',
    'レビュー重複',
    '異なる公開Artifact',
    '必須教材欠落',
  ] as const)('%sを旧独立照合のまま受理しない', async (kind) => {
    const record = await evidence();
    if (kind === '原本差替え') record.nativeEvidence.sha256 = 'f'.repeat(64);
    if (kind === '未確認を合格') Reflect.set(record, 'realHumanTrial', 'passed');
    if (kind === 'レビュー重複') record.personas[1]!.actor = record.personas[0]!.actor;
    if (kind === '異なる公開Artifact') record.pagesStaticStudy.canonicalDistSha256 = 'b'.repeat(64);
    if (kind === '必須教材欠落') record.pagesStaticStudy.lessonIds.pop();
    expect(() => validateNextReleaseEvidence(record, hashes)).toThrow();
  });
});
