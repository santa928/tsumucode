import { z } from 'zod';

export const DraftReleaseCourseIdSchema = z.enum(['tailwind', 'python-practice', 'python-oop']);
export type DraftReleaseCourseId = z.infer<typeof DraftReleaseCourseIdSchema>;
export const DraftEvidenceTargetSchema = z.enum([
  'browser-ui',
  'browser-tailwind',
  'portable-vite',
  'browser-pyodide',
  'node-pyodide',
  'local-cpython',
]);

const LESSONS = {
  tailwind: [
    'tailwind-ch01-l01',
    'tailwind-ch01-l02',
    'tailwind-ch01-l03',
    'tailwind-ch01-l04',
    'tailwind-ch02-l01',
  ],
  'python-practice': [
    'python-practice-ch01-l01',
    'python-practice-ch01-l02',
    'python-practice-ch01-l03',
    'python-practice-ch02-l01',
    'python-practice-ch03-l01',
  ],
  'python-oop': [
    'python-oop-ch01-l01',
    'python-oop-ch01-l02',
    'python-oop-ch02-l01',
    'python-oop-ch02-l02',
    'python-oop-ch02-l03',
    'python-oop-ch03-l01',
    'python-oop-ch03-l02',
    'python-oop-ch03-l03',
    'python-oop-ch04-l01',
  ],
} as const;

const CONTRACTS = {
  tailwind: {
    courseId: 'tailwind',
    sourceRoot: 'content/tailwind',
    qualityPath: 'docs/quality/tailwind-release-preparation.yaml',
    contentReviewPath: 'docs/quality/content-review-tailwind.yaml',
    manifestPath: 'generated/content/courses/tailwind/index.json',
    publicProvenancePath: 'generated/content/courses/tailwind/provenance.json',
    lessonIds: LESSONS['tailwind'],
    computerUseLessonIds: LESSONS['tailwind'],
    runtimeRequirements: [
      { target: 'browser-tailwind', lessonIds: LESSONS['tailwind'] },
      { target: 'portable-vite', lessonIds: ['tailwind-ch02-l01'] },
    ],
  },
  'python-practice': {
    courseId: 'python-practice',
    sourceRoot: 'content/python-practice',
    qualityPath: 'docs/quality/python-practice-release-preparation.yaml',
    contentReviewPath: 'docs/quality/content-review-python-practice.yaml',
    manifestPath: 'generated/content/courses/python-practice/index.json',
    publicProvenancePath: 'generated/content/courses/python-practice/provenance.json',
    lessonIds: LESSONS['python-practice'],
    computerUseLessonIds: ['python-practice-ch01-l01', 'python-practice-ch03-l01'],
    runtimeRequirements: [
      { target: 'node-pyodide', lessonIds: LESSONS['python-practice'] },
      { target: 'local-cpython', lessonIds: LESSONS['python-practice'] },
      {
        target: 'browser-pyodide',
        lessonIds: ['python-practice-ch01-l01', 'python-practice-ch03-l01'],
      },
    ],
  },
  'python-oop': {
    courseId: 'python-oop',
    sourceRoot: 'content/python-oop',
    qualityPath: 'docs/quality/python-oop-release-preparation.yaml',
    contentReviewPath: 'docs/quality/content-review-python-oop.yaml',
    manifestPath: 'generated/content/courses/python-oop/index.json',
    publicProvenancePath: 'generated/content/courses/python-oop/provenance.json',
    lessonIds: LESSONS['python-oop'],
    computerUseLessonIds: ['python-oop-ch01-l01', 'python-oop-ch04-l01'],
    runtimeRequirements: [
      { target: 'node-pyodide', lessonIds: LESSONS['python-oop'] },
      { target: 'local-cpython', lessonIds: LESSONS['python-oop'] },
      { target: 'browser-pyodide', lessonIds: ['python-oop-ch01-l01', 'python-oop-ch04-l01'] },
    ],
  },
} as const;

/** 公開入口とは別の固定3草稿契約を解決し、未知IDとpathの注入を拒否する。 */
export function resolveDraftReleaseCourseContract(courseId: unknown) {
  return CONTRACTS[DraftReleaseCourseIdSchema.parse(courseId)];
}

/** 同時固定する3草稿の記録だけを除外し、相互bindingの循環を避ける。任意pathは受け取らない。 */
export function draftReleaseMetadataPaths(): ReadonlySet<string> {
  return new Set(
    Object.values(CONTRACTS).flatMap((contract) => [
      contract.qualityPath,
      contract.contentReviewPath,
    ]),
  );
}
