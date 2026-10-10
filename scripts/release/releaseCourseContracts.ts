import { z } from 'zod';

export const ReleaseCourseIdSchema = z.enum([
  'html-css',
  'javascript',
  'typescript',
  'react',
  'next',
]);
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
  // 2026-10-03 19:13 JST本人承認: 今回の教材受入は新規6教材だけ。
  personaAcceptanceLessonIds: [
    'javascript-ch12-l01',
    'javascript-ch12-l02',
    'javascript-ch12-l03',
    'javascript-ch12-l04',
    'javascript-ch12-l05',
    'javascript-ch13-l01',
  ],
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

const typescriptContract = {
  courseId: 'typescript',
  sourceRoot: 'content/typescript',
  historyPath: 'content/typescript/release-history.yaml',
  approvalPath: 'docs/quality/typescript-release-approval.yaml',
  manifestRoot: 'generated/content/courses/typescript',
  publicProvenancePath: 'generated/content/courses/typescript/provenance.json',
  syntheticProgressBundlePath: 'tests/fixtures/progress/typescript-previous-release-bundle.json',
  postDeployRoot: 'docs/quality/post-deploy/typescript',
  schemaVersion: 2,
  lessonCount: 15,
  standardLessonCount: 12,
  guidedLessonCount: 3,
  capstoneLessonCount: 0,
  chapterCount: 6,
  phaseCount: 2,
  estimatedMinutes: 320,
  learningEvidenceKind: 'agent-simulated-learning',
  records: {
    contentReview: 'docs/quality/content-review-typescript.yaml',
    technicalAcceptance: 'docs/quality/typescript-release-acceptance.yaml',
  },
} as const;

const reactContract = {
  courseId: 'react',
  sourceRoot: 'content/react',
  historyPath: 'content/react/release-history.yaml',
  approvalPath: 'docs/quality/react-release-approval.yaml',
  manifestRoot: 'generated/content/courses/react',
  publicProvenancePath: 'generated/content/courses/react/provenance.json',
  syntheticProgressBundlePath: 'tests/fixtures/progress/react-previous-release-bundle.json',
  postDeployRoot: 'docs/quality/post-deploy/react',
  schemaVersion: 2,
  lessonCount: 15,
  standardLessonCount: 12,
  guidedLessonCount: 2,
  capstoneLessonCount: 1,
  chapterCount: 3,
  phaseCount: 2,
  estimatedMinutes: 490,
  learningEvidenceKind: 'agent-simulated-learning',
  records: {
    contentReview: 'docs/quality/content-review-react.yaml',
    technicalAcceptance: 'docs/quality/react-release-acceptance.yaml',
  },
} as const;

const nextContract = {
  courseId: 'next',
  sourceRoot: 'content/next',
  historyPath: 'content/next/release-history.yaml',
  approvalPath: 'docs/quality/next-release-approval.yaml',
  manifestRoot: 'generated/content/courses/next',
  publicProvenancePath: 'generated/content/courses/next/provenance.json',
  syntheticProgressBundlePath: 'tests/fixtures/progress/next-previous-release-bundle.json',
  postDeployRoot: 'docs/quality/post-deploy/next',
  schemaVersion: 2,
  lessonCount: 9,
  standardLessonCount: 7,
  guidedLessonCount: 1,
  capstoneLessonCount: 1,
  chapterCount: 6,
  phaseCount: 1,
  estimatedMinutes: 345,
  learningEvidenceKind: 'agent-simulated-learning',
  records: {
    contentReview: 'docs/quality/content-review-next.yaml',
    technicalAcceptance: 'docs/quality/next-release-acceptance.yaml',
  },
} as const;

export type ReleaseCourseContract =
  | typeof htmlCssContract
  | typeof javascriptContract
  | typeof typescriptContract
  | typeof reactContract
  | typeof nextContract;

export function resolveReleaseCourseContract(courseId: 'html-css'): typeof htmlCssContract;
export function resolveReleaseCourseContract(courseId: 'javascript'): typeof javascriptContract;
export function resolveReleaseCourseContract(courseId: 'typescript'): typeof typescriptContract;
export function resolveReleaseCourseContract(courseId: 'react'): typeof reactContract;
export function resolveReleaseCourseContract(courseId: 'next'): typeof nextContract;
export function resolveReleaseCourseContract(courseId: unknown): ReleaseCourseContract;
/** 明示allowlistだけから固定pathと品質契約を解決し、未知Courseを拒否する。 */
export function resolveReleaseCourseContract(courseId: unknown): ReleaseCourseContract {
  const selected = ReleaseCourseIdSchema.parse(courseId);
  if (selected === 'html-css') return htmlCssContract;
  if (selected === 'javascript') return javascriptContract;
  if (selected === 'next') return nextContract;
  return selected === 'typescript' ? typescriptContract : reactContract;
}

/** JSにも必要なHTMLの存在を保持する、site全体の公開台帳集合（未公開Courseの空履歴は公開を意味しない）を返す。 */
export const SITE_RELEASE_COURSE_IDS: readonly ReleaseCourseId[] = [
  'html-css',
  'javascript',
  'typescript',
  'react',
  'next',
];

/** Productから除外する履歴は既知のliteral4fileだけに限定する。 */
export const RELEASE_HISTORY_PATHS: readonly string[] = [
  htmlCssContract.historyPath,
  javascriptContract.historyPath,
  typescriptContract.historyPath,
  reactContract.historyPath,
  nextContract.historyPath,
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

/** HTML旧除外を保ち、JS/TS/Reactだけは宣言literal以外をProductとして検査する。 */
export function isReleaseMetadataPath(
  relative: string,
  courseId: ReleaseCourseId = 'html-css',
  revision?: string,
): boolean {
  resolveReleaseCourseContract(courseId);
  return courseId !== 'html-css'
    ? releaseMetadataPaths(courseId, revision).includes(relative)
    : relative.startsWith('docs/superpowers/') ||
        relative.startsWith('docs/quality/') ||
        RELEASE_HISTORY_PATHS.includes(relative);
}
