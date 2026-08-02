/** Browser統合Test向けにCatalog v3・Course Index・LessonのHTTP Fixtureを構築する。 */
import {
  CourseCatalogV3Schema,
  CourseIndexSchema,
  LessonManifestSchema,
} from '../../src/core/content/deliverySchema';
import { lessonStartTarget } from '../../src/core/content/lessonStart';
import { CourseManifestSchema } from '../../src/core/content/schema';
import type {
  CourseCatalogV3,
  CourseIndex,
  CourseManifest,
  Lesson,
  LessonOutline,
} from '../../src/core/content/types';

export interface SplitCourseFetchFixture {
  readonly catalog: CourseCatalogV3;
  readonly sources: ReadonlyMap<string, string>;
}

type CourseEntityIds = CourseIndex['entityIds'];

/** UTF-8文字列のSHA-256をBrowser Web Cryptoで小文字hexへ変換する。 */
async function sha256(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 同じIDを最初の教材位置だけに保持する。 */
function pushUnique(target: string[], id: string): void {
  if (!target.includes(id)) target.push(id);
}

/** Course本文からIndexの進捗対象IDを教材順で収集する。 */
function collectEntityIds(course: CourseManifest): CourseEntityIds {
  const result: { -readonly [Key in keyof CourseEntityIds]: string[] } = {
    chapter: [],
    lesson: [],
    slide: [],
    exercise: [],
    rule: [],
    hint: [],
    checklist: [],
    workspace: [],
  };
  for (const phase of course.phases) {
    for (const chapter of phase.chapters) {
      pushUnique(result.chapter, chapter.id);
      for (const lesson of chapter.lessons) {
        pushUnique(result.lesson, lesson.id);
        for (const slide of lesson.slides) pushUnique(result.slide, slide.id);
        for (const exercise of lesson.exercises) {
          pushUnique(result.exercise, exercise.id);
          pushUnique(result.workspace, exercise.workspaceId);
          for (const rule of exercise.validationRules) {
            pushUnique(result.rule, rule.id);
            if (rule.groupId !== undefined) pushUnique(result.rule, rule.groupId);
          }
          for (const hint of exercise.hints) pushUnique(result.hint, hint.id);
        }
        if (lesson.kind !== 'standard') {
          for (const item of lesson.project.checklist) pushUnique(result.checklist, item.id);
        }
      }
    }
  }
  return result;
}

/** Lesson本文を配信Indexのoutlineへ投影する。 */
function createLessonOutline(
  courseId: string,
  lesson: Lesson,
  manifestSha256: string,
): LessonOutline {
  const base = {
    id: lesson.id,
    title: lesson.title,
    goal: lesson.goal,
    estimatedMinutes: lesson.estimatedMinutes,
    prerequisiteLessonIds: lesson.prerequisiteLessonIds,
    ...(lesson.nextLessonId === undefined ? {} : { nextLessonId: lesson.nextLessonId }),
    slides: lesson.slides.map(({ id, title, kind }) => ({ id, title, kind })),
    exercises: lesson.exercises.map(({ id, title, kind, workspaceId }) => ({
      id,
      title,
      kind,
      workspaceId,
    })),
    manifestPath: `generated/content/courses/${courseId}/lessons/${lesson.id}.json`,
    manifestSha256,
  };
  if (lesson.kind === 'standard') {
    return { ...base, kind: lesson.kind, completion: lesson.completion };
  }
  const requiredChecklistItems = lesson.project.checklist
    .filter(({ required }) => required)
    .map(({ id, label, ruleIds }) => ({ id, label, ruleIds }));
  if (lesson.kind === 'guided-project') {
    return {
      ...base,
      kind: lesson.kind,
      requiredChecklistItems,
      completion: lesson.completion,
    };
  }
  return {
    ...base,
    kind: lesson.kind,
    requiredChecklistItems,
    completion: lesson.completion,
  };
}

/** 1 Courseをruntimeが取得する分割JSON bytesとCatalog v3へ変換する。 */
export async function createSplitCourseFetchFixture(
  input: CourseManifest,
): Promise<SplitCourseFetchFixture> {
  const course = CourseManifestSchema.parse({
    ...input,
    provenanceManifestPath: `generated/content/courses/${input.id}/provenance.json`,
  });
  const lessons = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons: chapterLessons }) => chapterLessons),
  );
  const lessonArtifacts = await Promise.all(
    lessons.map(async (lesson) => {
      const manifest = LessonManifestSchema.parse({
        schemaVersion: 1,
        courseId: course.id,
        courseRevision: course.revision,
        lessonId: lesson.id,
        lesson,
      });
      const source = JSON.stringify(manifest);
      return {
        manifest,
        source,
        outline: createLessonOutline(course.id, lesson, await sha256(source)),
      };
    }),
  );
  const outlineById = new Map(lessonArtifacts.map(({ outline }) => [outline.id, outline]));
  const index = CourseIndexSchema.parse({
    schemaVersion: 1,
    id: course.id,
    title: course.title,
    description: course.description,
    audience: course.audience,
    estimatedMinutes: course.estimatedMinutes,
    revision: course.revision,
    runnerId: course.runnerId,
    validatorId: course.validatorId,
    glossary: course.glossary,
    concepts: course.concepts,
    supportedDevices: course.supportedDevices,
    prerequisites: course.prerequisites,
    publicationStatus: course.publicationStatus,
    expectedTotals: course.expectedTotals,
    provenanceManifestPath: course.provenanceManifestPath,
    progressMigrations: course.progressMigrations,
    entityIds: collectEntityIds(course),
    phases: course.phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      description: phase.description,
      chapters: phase.chapters.map((chapter) => ({
        id: chapter.id,
        sequence: chapter.sequence,
        title: chapter.title,
        goal: chapter.goal,
        estimatedMinutes: chapter.estimatedMinutes,
        kind: chapter.kind,
        lessons: chapter.lessons.map(({ id }) => outlineById.get(id)!),
      })),
    })),
  });
  const indexPath = `generated/content/courses/${course.id}/index.json`;
  const indexSource = JSON.stringify(index);
  const catalog = CourseCatalogV3Schema.parse({
    schemaVersion: 3,
    courses: [
      {
        id: course.id,
        title: course.title,
        description: course.description,
        audience: course.audience,
        estimatedMinutes: course.estimatedMinutes,
        revision: course.revision,
        publicationStatus: course.publicationStatus,
        indexPath,
        indexSha256: await sha256(indexSource),
        lessonStarts: index.phases.flatMap(({ chapters }) =>
          chapters.flatMap(({ lessons: outlines }) =>
            outlines.map((outline) => ({
              lessonId: outline.id,
              target: lessonStartTarget(outline),
            })),
          ),
        ),
      },
    ],
    learningPaths: [],
  });
  return {
    catalog,
    sources: new Map([
      ['generated/content/catalog-v3.json', JSON.stringify(catalog)],
      [indexPath, indexSource],
      ...lessonArtifacts.map(({ outline, source }) => [outline.manifestPath, source] as const),
    ]),
  };
}
