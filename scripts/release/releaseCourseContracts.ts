import { z } from 'zod';

export const ReleaseCourseIdSchema = z.enum(['html-css', 'javascript']);
export type ReleaseCourseId = z.infer<typeof ReleaseCourseIdSchema>;

const htmlCssContract = {
  courseId: 'html-css',
  sourceRoot: 'content/html-css',
  historyPath: 'content/html-css/release-history.yaml',
  approvalPath: 'docs/quality/release-approval.yaml',
  manifestRoot: 'generated/content/courses/html-css',
  publicProvenancePath: 'generated/content/courses/html-css/provenance.json',
  syntheticProgressBundlePath: 'tests/fixtures/progress/previous-release-bundle.json',
  postDeployRoot: 'docs/quality/post-deploy',
  schemaVersion: 1,
  lessonCount: 51,
  learningEvidenceKind: 'human-novice',
  requiredHumanCheckpoints: 5,
  records: {
    contentReview: 'docs/quality/content-review.yaml',
    visualReview: 'docs/quality/visual-review.md',
    accessibilityManual: 'docs/quality/a11y-manual.md',
    noviceObservation: 'docs/quality/novice-observation.md',
    releaseChecklist: 'docs/quality/release-checklist.md',
  },
} as const;

const javascriptContract = {
  courseId: 'javascript',
  sourceRoot: 'content/javascript',
  historyPath: 'content/javascript/release-history.yaml',
  approvalPath: 'docs/quality/javascript-release-approval.yaml',
  manifestRoot: 'generated/content/courses/javascript',
  publicProvenancePath: 'generated/content/courses/javascript/provenance.json',
  syntheticProgressBundlePath: 'tests/fixtures/progress/javascript-previous-release-bundle.json',
  postDeployRoot: 'docs/quality/post-deploy/javascript',
  schemaVersion: 2,
  lessonCount: 52,
  standardLessonCount: 46,
  guidedLessonCount: 5,
  capstoneLessonCount: 1,
  chapterCount: 14,
  phaseCount: 4,
  estimatedMinutes: 1010,
  requiredExerciseCount: 52,
  optionalExerciseIds: ['javascript-ch03-l05-e02', 'javascript-ch03-l05-e03'],
  evaluatedExerciseCount: 54,
  learningEvidenceKind: 'agent-simulated-learning',
  records: {
    contentReview: 'docs/quality/content-review-javascript.yaml',
    visualReview: 'docs/quality/javascript-visual-review.yaml',
    accessibilityManual: 'docs/quality/javascript-a11y-manual.yaml',
    agentLearning: 'docs/quality/javascript-agent-learning.yaml',
    inputValidity: 'docs/quality/javascript-input-validity.yaml',
    releaseChecklist: 'docs/quality/javascript-release-checklist.yaml',
    finalCodeReview: 'docs/quality/javascript-final-code-review.yaml',
  },
} as const;

export type ReleaseCourseContract = typeof htmlCssContract | typeof javascriptContract;

export function resolveReleaseCourseContract(courseId: 'html-css'): typeof htmlCssContract;
export function resolveReleaseCourseContract(courseId: 'javascript'): typeof javascriptContract;
export function resolveReleaseCourseContract(courseId: unknown): ReleaseCourseContract;
/** 明示allowlistだけから固定pathと品質契約を解決し、未知Courseを拒否する。 */
export function resolveReleaseCourseContract(courseId: unknown): ReleaseCourseContract {
  return ReleaseCourseIdSchema.parse(courseId) === 'html-css'
    ? htmlCssContract
    : javascriptContract;
}

/** JSにも必要なHTMLの存在を保持する、site全体の公開Course集合を返す。 */
export const SITE_RELEASE_COURSE_IDS: readonly ReleaseCourseId[] = ['html-css', 'javascript'];

/** Productから除外する履歴は既知のliteral2fileだけに限定する。 */
export const RELEASE_HISTORY_PATHS: readonly string[] = [
  htmlCssContract.historyPath,
  javascriptContract.historyPath,
];

/** JSのP→Mとcandidate除外へ同じ宣言済みliteral記録集合を提供する。revision以外をpattern化しない。 */
export function releaseMetadataPaths(
  courseId: ReleaseCourseId,
  revision?: string,
): readonly string[] {
  const contract = resolveReleaseCourseContract(courseId);
  if (revision !== undefined && !/^\d{4}-\d{2}-\d{2}\.\d+$/u.test(revision))
    throw new Error('Release metadata revisionが不正です');
  return [
    contract.historyPath,
    contract.approvalPath,
    ...Object.values(contract.records),
    ...(revision === undefined ? [] : [`${contract.postDeployRoot}/${revision}.yaml`]),
  ];
}

/** HTML旧除外を保ち、JSだけは宣言literal以外をProductとして検査する。 */
export function isReleaseMetadataPath(
  relative: string,
  courseId: ReleaseCourseId = 'html-css',
  revision?: string,
): boolean {
  resolveReleaseCourseContract(courseId);
  return courseId === 'javascript'
    ? releaseMetadataPaths(courseId, revision).includes(relative)
    : relative.startsWith('docs/superpowers/') ||
        relative.startsWith('docs/quality/') ||
        RELEASE_HISTORY_PATHS.includes(relative);
}
