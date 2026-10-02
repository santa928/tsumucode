// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveReleaseCourseContract } from '../../scripts/release/releaseCourseContracts';
import {
  parseCourseReleaseApproval,
  parseCourseReleaseHistory,
} from '../../scripts/release/javascriptReleaseSchema';

/** 実承認へ転記しないdraftのschema fixture。revisionはテスト値であり最終値ではない。 */
function draftHistory() {
  return {
    schemaVersion: 2,
    courseId: 'javascript',
    releases: [],
    candidate: {
      courseId: 'javascript',
      draftSourceCommit: 'draft',
      draftCanonicalDistSha256: 'draft',
      normalizedLearningInputSha256: 'draft',
      revision: '2026-10-02.99',
      status: 'draft',
      verifiedSourceCommit: 'draft',
      canonicalDistSha256: 'draft',
      courseManifestSha256: 'draft',
      publicProvenanceSha256: 'draft',
      persistentIdsSha256: 'draft',
      persistentIds: [],
      previousReleaseTag: null,
      tombstonedIds: [],
      migrations: [],
      syntheticProgressBundlePath:
        'tests/fixtures/progress/javascript-previous-release-bundle.json',
    },
  };
}

/** JS専用literal記録だけを指すdraft approvalのテスト値を返す。 */
function draftApproval() {
  const contract = resolveReleaseCourseContract('javascript');
  return {
    schemaVersion: 2,
    courseId: 'javascript',
    status: 'draft',
    verifiedSourceCommit: 'draft',
    candidateTreeSha256: 'draft',
    canonicalDistSha256: 'draft',
    courseManifestSha256: 'draft',
    publicProvenanceSha256: 'draft',
    visualBaselineSha256: 'draft',
    records: Object.fromEntries(
      Object.entries(contract.records).map(([name, recordPath]) => [
        name,
        { path: recordPath, sha256: 'draft' },
      ]),
    ),
    approvedBy: 'draft',
    approvedAt: 'draft',
  };
}

describe('Course別通常公開の固定契約', () => {
  it('HTMLの51Lesson/真人5Checkpoint契約とJSの52Lesson/全54操作を区別する', () => {
    const html = resolveReleaseCourseContract('html-css');
    const js = resolveReleaseCourseContract('javascript');
    expect(html.lessonCount).toBe(51);
    expect(html.learningEvidenceKind).toBe('human-novice');
    expect(html.requiredHumanCheckpoints).toBe(5);
    expect(js.lessonCount).toBe(52);
    expect(js.requiredExerciseCount).toBe(52);
    expect(js.optionalExerciseIds).toEqual(['javascript-ch03-l05-e02', 'javascript-ch03-l05-e03']);
    expect(js.evaluatedExerciseCount).toBe(54);
    expect(js.learningEvidenceKind).toBe('agent-simulated-learning');
    expect(js.historyPath).toBe('content/javascript/release-history.yaml');
  });

  it.each([undefined, null, '', 'typescript', 'HTML-CSS', '../javascript', {}])(
    '未知Course %j をHTMLへfallbackしない',
    (courseId) => {
      expect(() => resolveReleaseCourseContract(courseId)).toThrow();
    },
  );

  it('JS履歴はroot/candidate双方にcourseIdを要求し、mixed/legacyを拒否する', () => {
    expect(parseCourseReleaseHistory('javascript', draftHistory()).courseId).toBe('javascript');
    const missing = draftHistory();
    expect(() =>
      parseCourseReleaseHistory('javascript', { ...missing, courseId: undefined }),
    ).toThrow();
    expect(() =>
      parseCourseReleaseHistory('javascript', {
        ...missing,
        candidate: { ...missing.candidate, courseId: 'html-css' },
      }),
    ).toThrow();
    expect(() => parseCourseReleaseHistory('html-css', missing)).toThrow();
  });

  it('JS approvalからHTML品質pathや余分な記録への差替えを拒否する', () => {
    const approval = draftApproval();
    expect(parseCourseReleaseApproval('javascript', approval).courseId).toBe('javascript');
    expect(() =>
      parseCourseReleaseApproval('javascript', {
        ...approval,
        records: {
          ...approval.records,
          agentLearning: { path: 'docs/quality/novice-observation.md', sha256: 'draft' },
        },
      }),
    ).toThrow();
    expect(() =>
      parseCourseReleaseApproval('javascript', {
        ...approval,
        records: {
          ...approval.records,
          unexpected: { path: 'docs/quality/javascript-agent-learning.yaml', sha256: 'draft' },
        },
      }),
    ).toThrow();
    expect(() => parseCourseReleaseApproval('html-css', approval)).toThrow();
  });
});
