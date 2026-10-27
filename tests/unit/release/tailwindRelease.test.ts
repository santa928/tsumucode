// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { compileCourse } from '../../../scripts/content/compileCourse';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import type { CourseManifest } from '../../../src/core/content/types';
import { sha256Text } from '../../../scripts/release/releaseHashes';
import {
  parseCourseReleaseApproval,
  parseCourseReleaseHistory,
} from '../../../scripts/release/javascriptReleaseSchema';
import { resolveBetaTarget } from '../../../scripts/release/verifyReleaseTarget';
import { validatePostDeployVerification } from '../../../scripts/release/verifyReleasePromotion';
import {
  normalizeTailwindFrontend,
  normalizeTailwindPublicationFile,
  isTailwindPublicationInput,
} from '../../../scripts/release/tailwindPublicationInputs';
import { verifyTailwindSyntheticProgressBundle } from '../../../scripts/release/tailwindSyntheticContinuity';
import {
  validateTailwindReleaseEvidence,
  hashTailwindReleaseEvidence,
  type TailwindReleaseEvidence,
} from '../../../scripts/release/verifyTailwindQualityEvidence';

let course: CourseManifest;
let bundle: Record<string, unknown>;
let frontend: string;
beforeAll(async () => {
  course = (await compileCourse('content/tailwind')).runtime;
  bundle = JSON.parse(
    await readFile('tests/fixtures/progress/tailwind-previous-release-bundle.json', 'utf8'),
  ) as Record<string, unknown>;
  frontend = await readFile('content/learning-paths/frontend.yaml', 'utf8');
});

/** 改変後の整合hashを再計算し、保存内容の欠落検出も確認する。 */
function sign(value: Record<string, unknown>) {
  Reflect.deleteProperty(value, 'integrity');
  return {
    ...value,
    integrity: { algorithm: 'SHA-256', digest: sha256Text(canonicalJson(value)) },
  };
}

describe('Tailwind正式公開の固定境界', () => {
  it('専用の未承認台帳と承認記録を読み、他Course混在とbetaを拒否する', async () => {
    const history: unknown = parse(await readFile('content/tailwind/release-history.yaml', 'utf8'));
    const approval = parseCourseReleaseApproval(
      'tailwind',
      parse(await readFile('docs/quality/tailwind-release-approval.yaml', 'utf8')),
    );
    expect(parseCourseReleaseHistory('tailwind', history)).toMatchObject({ courseId: 'tailwind' });
    expect(parseCourseReleaseApproval('tailwind', approval)).toMatchObject({ status: 'draft' });
    expect(() => parseCourseReleaseHistory('react', history)).toThrow();
    expect(() =>
      parseCourseReleaseApproval('tailwind', {
        ...approval,
        records: {
          ...approval.records,
          technicalAcceptance: {
            path: 'docs/quality/react-release-acceptance.yaml',
            sha256: 'draft',
          },
        },
      }),
    ).toThrow();
    expect(() =>
      resolveBetaTarget('a'.repeat(40), 'a'.repeat(40), 'a'.repeat(40), 'tailwind'),
    ).toThrow();
  });

  it('HTML/CSS直後のrecommended追加だけを許し、未開始でも後続requiredの前提を維持する', () => {
    const original = frontend.replace(
      '  - courseId: tailwind\n    role: recommended\n    prerequisiteCourseIds: [html-css]\n',
      '',
    );
    const registered = original.replace(
      '  - courseId: javascript',
      '  - courseId: tailwind\n    role: recommended\n    prerequisiteCourseIds: [html-css]\n  - courseId: javascript',
    );
    expect(normalizeTailwindFrontend(registered)).toBe(original);
    expect(() =>
      normalizeTailwindFrontend(registered.replace('role: recommended', 'role: required')),
    ).toThrow();
    expect(() =>
      normalizeTailwindFrontend(
        registered.replace(
          'prerequisiteCourseIds: [html-css]\n  - courseId: typescript',
          'prerequisiteCourseIds: [tailwind]\n  - courseId: typescript',
        ),
      ),
    ).toThrow();
    expect(() =>
      normalizeTailwindFrontend(
        registered +
          '  - courseId: tailwind\n    role: recommended\n    prerequisiteCourseIds: [html-css]\n',
      ),
    ).toThrow();
  });

  it('公開状態だけを正規化し、revisionや教材変更を保持する', async () => {
    const source = await readFile('content/tailwind/course.yaml', 'utf8');
    const draft = source
      .replace('publicationStatus: published', 'publicationStatus: draft')
      .replace('authoringSources:\n  - release-history.yaml', 'authoringSources: []');
    expect(
      normalizeTailwindPublicationFile(
        'content/tailwind/course.yaml',
        draft.replace('publicationStatus: draft', 'publicationStatus: published'),
      ),
    ).toBe(draft);
    expect(
      normalizeTailwindPublicationFile(
        'content/tailwind/course.yaml',
        draft.replace('estimatedMinutes: 130', 'estimatedMinutes: 140'),
      ),
    ).not.toBe(draft);
    for (const input of [
      'src/features/learning/portable/portableTailwindArchive.ts',
      'content/tailwind/concepts.yaml',
      'scripts/content/compileCourse.ts',
      'package-lock.json',
    ])
      expect(isTailwindPublicationInput(input)).toBe(true);
    expect(isTailwindPublicationInput('docs/quality/tailwind-release-approval.yaml')).toBe(false);
  });

  it('公開後はrecommended導線と持ち出しproduction buildを含む8操作を要求する', () => {
    const binding = {
      courseId: 'tailwind' as const,
      revision: '2026-10-15.2',
      tag: 'tsumucode-release-2026-10-15.2',
      sourceCommit: 'a'.repeat(40),
      workflowHeadCommit: 'b'.repeat(40),
      workflowRunId: '1',
      workflowRunAttempt: 1,
      reportArtifactId: '2',
      reportArtifactDigest: `sha256:${'c'.repeat(64)}`,
      pageUrl: 'https://example.test/tsumucode/',
      postDeployVerificationPath: 'docs/quality/post-deploy/tailwind/2026-10-15.2.yaml',
      postDeployVerificationSha256: 'd'.repeat(64),
    };
    const digest = binding.postDeployVerificationSha256;
    const metadata = { ...binding };
    Reflect.deleteProperty(metadata, 'postDeployVerificationPath');
    Reflect.deleteProperty(metadata, 'postDeployVerificationSha256');
    const record = {
      ...metadata,
      schemaVersion: 2,
      status: 'approved',
      environmentAdmissionStatus: 'passed',
      independentEnvironmentApproval: 'not-configured',
      pageVerificationStatus: 'passed',
      reportVerificationStatus: 'passed',
      tagVerificationStatus: 'passed',
      verifiedBy: 'independent-reviewer',
      verifiedAt: '2026-10-27T00:00:00.000Z',
      publicSmokeOperations: [
        'start',
        'resume',
        'grading',
        'persistence',
        'export',
        'fresh-import',
        'recommended-path',
        'portable-production-build',
      ].map((operationId) => ({
        operationId,
        status: 'passed',
        evidenceSha256: 'e'.repeat(64),
        observedAt: '2026-10-27T00:00:00.000Z',
      })),
      requiredUnconfirmed: 0,
    };
    expect(() => validatePostDeployVerification(record, binding, digest)).not.toThrow();
    for (const missing of ['recommended-path', 'portable-production-build']) {
      expect(() =>
        validatePostDeployVerification(
          {
            ...record,
            publicSmokeOperations: record.publicSmokeOperations.filter(
              ({ operationId }) => operationId !== missing,
            ),
          },
          binding,
          digest,
        ),
      ).toThrow();
    }
  });
});

describe('Tailwind保存互換', () => {
  it('5Workspace・Project工程・成功版・既存6Courseを実migratorで保持する', async () => {
    expect(await verifyTailwindSyntheticProgressBundle(course, bundle)).toMatchObject({
      migratedCourses: 7,
      migratedDrafts: 6,
      resetNotices: 0,
    });
  });
  it.each(['workspace', 'source', 'history', 'snapshot', 'existing-course'])(
    '%s欠落を正しい整合hashでも拒否する',
    async (kind) => {
      const copy = structuredClone(bundle) as {
        drafts: Record<string, Record<string, unknown>>;
        courses: Record<string, unknown>;
      };
      const draft = copy.drafts['tailwind:tailwind-ch02-l01-e01']!;
      if (kind === 'workspace')
        Reflect.deleteProperty(copy.drafts, 'tailwind:tailwind-ch02-l01-e01');
      if (kind === 'source') draft.files = {};
      if (kind === 'history')
        draft.validationHistory = (draft.validationHistory as unknown[]).slice(-1);
      if (kind === 'snapshot') draft.lastPassingSnapshots = {};
      if (kind === 'existing-course') Reflect.deleteProperty(copy.courses, 'javascript');
      await expect(verifyTailwindSyntheticProgressBundle(course, sign(copy))).rejects.toThrow();
    },
  );
});

describe('Tailwind独立原本照合receipt', () => {
  /** 合成値はschemaの拒否境界だけを検査し、実測原本として使用しない。 */
  function evidence(): TailwindReleaseEvidence {
    const value = {
      schemaVersion: 1,
      courseId: 'tailwind',
      status: 'preflight-passed-final-ci-required',
      verifiedSourceCommit: 'a'.repeat(40),
      canonicalDistSha256: 'b'.repeat(64),
      candidateTreeSha256: 'c'.repeat(64),
      publicationApprovalReference: 'synthetic-test',
      computerUseApprovalReference: 'synthetic-test',
      realHumanTrial: 'unverified',
      lowEndPhysicalDevice: 'unverified',
      author: 'author',
      draftCandidate: {
        sourceCommit: 'd'.repeat(40),
        sourceTree: 'e'.repeat(40),
        productTreeSha256: 'f'.repeat(64),
        canonicalDistSha256: '1'.repeat(64),
        runtimeSha256: '2'.repeat(64),
        publicProvenanceSha256: '3'.repeat(64),
        contentReviewSha256: '4'.repeat(64),
      },
      draftQualityRecordSha256: '5'.repeat(64),
      technicalVerification: { path: 'technical-verification.json', sha256: '6'.repeat(64) },
      draftOriginalsReview: { path: 'draft-originals.json', sha256: 'a'.repeat(64) },
      codeReviews: ['requirements-logic', 'security', 'structure'].map((role, index) => ({
        schemaVersion: 1,
        courseId: 'tailwind',
        actor: index === 0 ? 'independent-reviewer' : `reviewer-${index}`,
        role,
        sourceCommit: 'a'.repeat(40),
        productTreeSha256: 'c'.repeat(64),
        decision: 'approved',
        mandatoryFindings: 0,
        rawReport: { path: `review-${index}.json`, sha256: 'b'.repeat(64) },
      })),
      normalizedLearningInputSha256: '7'.repeat(64),
      independenceReview: {
        checkedReferences: [],
        reviewer: 'independent-reviewer',
        status: 'approved',
        sourceCommit: 'a'.repeat(40),
        productTreeSha256: 'c'.repeat(64),
        evidenceSha256: '8'.repeat(64),
        rawReport: { path: 'originals.json', sha256: '9'.repeat(64) },
      },
    } as TailwindReleaseEvidence;
    value.independenceReview.checkedReferences = [
      value.technicalVerification,
      value.draftOriginalsReview,
      ...value.codeReviews.map(({ rawReport }) => rawReport),
    ];
    value.independenceReview.evidenceSha256 = hashTailwindReleaseEvidence(value);
    return value;
  }
  it('原本照合を記録全体へ結び、自己承認・候補差替え・実人への書換えを拒否する', () => {
    const original = evidence();
    expect(validateTailwindReleaseEvidence(original)).toEqual(original);
    expect(() =>
      validateTailwindReleaseEvidence({ ...original, author: 'independent-reviewer' }),
    ).toThrow();
    expect(() =>
      validateTailwindReleaseEvidence({ ...original, canonicalDistSha256: '0'.repeat(64) }),
    ).toThrow();
    expect(() =>
      validateTailwindReleaseEvidence({ ...original, realHumanTrial: 'verified' }),
    ).toThrow();
  });
});
