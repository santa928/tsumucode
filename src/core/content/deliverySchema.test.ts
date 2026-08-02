import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../../tests/fixtures/course';
import { CourseCatalogV3Schema, CourseIndexSchema, LessonManifestSchema } from './deliverySchema';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/** 公開Index契約の最小成功例を、実装から独立したliteralで返す。 */
function validCourseIndex(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'html-css',
    title: 'HTML/CSS はじめの一歩',
    description: '最初の見出しを積むFixture Course',
    audience: 'プログラミングを初めて学ぶ人',
    estimatedMinutes: 15,
    revision: '2026-07-10.1',
    runnerId: 'html-css',
    validatorId: 'html-css',
    supportedDevices: {
      exercise: 'desktop',
      study: ['desktop', 'tablet', 'mobile'],
    },
    glossary: [
      {
        id: 'html',
        term: 'HTML',
        definition: 'Webページの意味と構造を表す言語',
        firstSlideId: 'slide-html-role',
        relatedIds: ['element'],
      },
      {
        id: 'element',
        term: '要素',
        definition: 'Tagと内容を合わせたHTMLの構成単位',
        firstSlideId: 'slide-html-role',
        relatedIds: ['html'],
      },
    ],
    concepts: [],
    prerequisites: [],
    publicationStatus: 'published',
    expectedTotals: {
      chapters: 1,
      lessons: 1,
      conceptSlides: 1,
      standardExercises: 1,
      guidedProjectLessons: 0,
      capstoneLessons: 0,
      estimatedMinutes: 15,
    },
    provenanceManifestPath: 'generated/content/courses/html-css/provenance.json',
    progressMigrations: [],
    entityIds: {
      chapter: ['ch00-web-map'],
      lesson: ['lesson-first-heading'],
      slide: ['slide-html-role'],
      exercise: ['exercise-first-heading'],
      rule: ['rule-h1-exists'],
      hint: ['hint-h1-1', 'hint-h1-2', 'hint-h1-3'],
      checklist: [],
      workspace: ['workspace-first-heading'],
    },
    phases: [
      {
        id: 'first-piece',
        title: '最初のピース',
        description: 'Web制作の入口',
        chapters: [
          {
            id: 'ch00-web-map',
            sequence: 0,
            title: 'Web制作の地図',
            goal: 'HTMLの役割を説明する',
            estimatedMinutes: 15,
            kind: 'standard',
            lessons: [
              {
                id: 'lesson-first-heading',
                kind: 'standard',
                title: '見出しを置く',
                goal: 'h1要素を使う',
                estimatedMinutes: 15,
                prerequisiteLessonIds: [],
                slides: [
                  {
                    id: 'slide-html-role',
                    title: 'HTMLは意味を伝える',
                    kind: 'concept',
                  },
                ],
                exercises: [
                  {
                    id: 'exercise-first-heading',
                    title: 'h1見出しを追加する',
                    kind: 'standard',
                    workspaceId: 'workspace-first-heading',
                  },
                ],
                completion: {
                  kind: 'standard',
                  finalSlideId: 'slide-html-role',
                  requiredExerciseIds: ['exercise-first-heading'],
                },
                manifestPath:
                  'generated/content/courses/html-css/lessons/lesson-first-heading.json',
                manifestSha256: SHA_A,
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Catalog v3契約の最小成功例を返す。 */
function validCatalog(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    courses: [
      {
        id: 'html-css',
        title: 'HTML/CSS はじめの一歩',
        description: '最初の見出しを積むFixture Course',
        audience: 'プログラミングを初めて学ぶ人',
        estimatedMinutes: 15,
        revision: '2026-07-10.1',
        publicationStatus: 'published',
        indexPath: 'generated/content/courses/html-css/index.json',
        indexSha256: SHA_B,
        lessonStarts: [
          {
            lessonId: 'lesson-first-heading',
            target: { kind: 'slide', targetId: 'slide-html-role' },
          },
        ],
      },
    ],
    learningPaths: [
      {
        id: 'frontend',
        title: 'フロントエンド学習パス',
        description: 'Webページから順番に学びます。',
        publicationStatus: 'published',
        steps: [
          {
            courseId: 'html-css',
            role: 'required',
            prerequisiteCourseIds: [],
          },
        ],
      },
    ],
  };
}

describe('CourseIndexSchema', () => {
  it('Lesson本文を持たない厳密なCourse Indexを受理する', () => {
    expect(CourseIndexSchema.parse(validCourseIndex())).toMatchObject({
      id: 'html-css',
      schemaVersion: 1,
    });
  });

  it('Course IndexへLesson本文を混入できない', () => {
    const index = validCourseIndex();
    const phases = index.phases as Array<{
      chapters: Array<{ lessons: Array<Record<string, unknown>> }>;
    }>;
    phases[0]!.chapters[0]!.lessons[0]!.blocks = [];
    expect(CourseIndexSchema.safeParse(index).success).toBe(false);
  });

  it.each([
    ['absolute URL', 'https://example.test/private.json'],
    ['query', 'generated/content/courses/html-css/index.json?raw=1'],
    ['encoded traversal', 'generated/content/%2e%2e/private.json'],
  ])('%sの公開Pathを拒否する', (_label, indexPath) => {
    const index = validCourseIndex();
    index.provenanceManifestPath = indexPath;
    expect(CourseIndexSchema.safeParse(index).success).toBe(false);
  });

  it('64桁lowercase SHA以外を拒否する', () => {
    const index = validCourseIndex();
    const phases = index.phases as Array<{
      chapters: Array<{ lessons: Array<Record<string, unknown>> }>;
    }>;
    phases[0]!.chapters[0]!.lessons[0]!.manifestSha256 = 'ABC123';
    expect(CourseIndexSchema.safeParse(index).success).toBe(false);
  });

  it('Lesson completionから存在しないSlideを参照できない', () => {
    const index = validCourseIndex();
    const phases = index.phases as Array<{
      chapters: Array<{ lessons: Array<{ completion: { finalSlideId: string } }> }>;
    }>;
    phases[0]!.chapters[0]!.lessons[0]!.completion.finalSlideId = 'missing-slide';
    expect(CourseIndexSchema.safeParse(index).success).toBe(false);
  });

  it('entityIdsとoutlineのLesson IDが食い違うIndexを拒否する', () => {
    const index = validCourseIndex();
    const entityIds = index.entityIds as { lesson: string[] };
    entityIds.lesson = ['different-lesson'];
    expect(CourseIndexSchema.safeParse(index).success).toBe(false);
  });
});

describe('LessonManifestSchema', () => {
  it('Course revisionとLesson IDが対応するManifestを受理する', () => {
    expect(
      LessonManifestSchema.safeParse({
        schemaVersion: 1,
        courseId: fixtureCourse.id,
        courseRevision: fixtureCourse.revision,
        lessonId: fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.id,
        lesson: fixtureCourse.phases[0]!.chapters[0]!.lessons[0],
      }).success,
    ).toBe(true);
  });

  it('top-level Lesson IDと本文のID不一致を拒否する', () => {
    expect(
      LessonManifestSchema.safeParse({
        schemaVersion: 1,
        courseId: fixtureCourse.id,
        courseRevision: fixtureCourse.revision,
        lessonId: 'different-lesson',
        lesson: fixtureCourse.phases[0]!.chapters[0]!.lessons[0],
      }).success,
    ).toBe(false);
  });
});

describe('CourseCatalogV3Schema', () => {
  it('IndexのpathとSHAだけを持つCatalog v3を受理する', () => {
    expect(CourseCatalogV3Schema.parse(validCatalog())).toMatchObject({ schemaVersion: 3 });
  });

  it('canonical Index pathが重複するCourseを拒否する', () => {
    const catalog = validCatalog();
    const courses = catalog.courses as Array<Record<string, unknown>>;
    courses.push({
      ...structuredClone(courses[0]!),
      id: 'javascript',
      title: 'JavaScript',
    });
    expect(CourseCatalogV3Schema.safeParse(catalog).success).toBe(false);
  });

  it('公開LearningPathからdraft Courseを参照できない', () => {
    const catalog = validCatalog();
    const courses = catalog.courses as Array<Record<string, unknown>>;
    courses[0]!.publicationStatus = 'draft';
    expect(CourseCatalogV3Schema.safeParse(catalog).success).toBe(false);
  });
});
