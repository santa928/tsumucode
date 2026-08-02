/** 完全検証済みCourseをCourse IndexとLesson Manifestへ損失なく分割する。 */
import { createHash } from 'node:crypto';
import { CourseIndexSchema, LessonManifestSchema } from '../../src/core/content/deliverySchema';
import { CourseManifestSchema } from '../../src/core/content/schema';
import type {
  CourseIndex,
  CourseManifest,
  Lesson,
  LessonManifest,
  LessonOutline,
} from '../../src/core/content/types';
import { stringifyCanonicalJson } from './compileCourse';

export interface SplitCourseArtifacts {
  readonly index: CourseIndex;
  readonly lessons: readonly LessonManifest[];
}

type CourseEntityIds = CourseIndex['entityIds'];

/** canonical JSON bytesのSHA-256を小文字hexで返す。 */
export function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(stringifyCanonicalJson(value), 'utf8').digest('hex');
}

/** Course／Lesson IDから公開Lesson Manifest pathを決定的に作る。 */
export function lessonManifestPath(courseId: string, lessonId: string): string {
  return `generated/content/courses/${courseId}/lessons/${lessonId}.json`;
}

/** 同じIDを最初の教材位置だけに保持する。 */
function pushUnique(target: string[], id: string): void {
  if (!target.includes(id)) target.push(id);
}

/** Course内の進捗対象IDを教材順で重複なく収集する。 */
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

/** Lesson本文からRuntime順序判定に必要なoutlineだけを投影する。 */
function projectLessonOutline(
  lesson: Lesson,
  manifestPath: string,
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
    manifestPath,
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

/** Courseを教材順のIndexとLesson Manifest列へ決定的に分割する。 */
export function splitCourseArtifacts(course: CourseManifest): SplitCourseArtifacts {
  const validated = CourseManifestSchema.parse(course);
  const lessonById = new Map<string, LessonManifest>();
  for (const phase of validated.phases) {
    for (const chapter of phase.chapters) {
      for (const lesson of chapter.lessons) {
        const manifest = LessonManifestSchema.parse({
          schemaVersion: 1,
          courseId: validated.id,
          courseRevision: validated.revision,
          lessonId: lesson.id,
          lesson,
        });
        lessonById.set(lesson.id, manifest);
      }
    }
  }

  const index = CourseIndexSchema.parse({
    schemaVersion: 1,
    id: validated.id,
    title: validated.title,
    description: validated.description,
    audience: validated.audience,
    estimatedMinutes: validated.estimatedMinutes,
    revision: validated.revision,
    runnerId: validated.runnerId,
    validatorId: validated.validatorId,
    glossary: validated.glossary,
    concepts: validated.concepts,
    supportedDevices: validated.supportedDevices,
    prerequisites: validated.prerequisites,
    publicationStatus: validated.publicationStatus,
    expectedTotals: validated.expectedTotals,
    provenanceManifestPath: validated.provenanceManifestPath,
    progressMigrations: validated.progressMigrations,
    entityIds: collectEntityIds(validated),
    phases: validated.phases.map((phase) => ({
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
        lessons: chapter.lessons.map((lesson) => {
          const manifest = lessonById.get(lesson.id)!;
          return projectLessonOutline(
            lesson,
            lessonManifestPath(validated.id, lesson.id),
            canonicalSha256(manifest),
          );
        }),
      })),
    })),
  });
  const lessons = index.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons: outlines }) =>
      outlines.map(({ id }) => {
        const manifest = lessonById.get(id);
        if (manifest === undefined) throw new Error(`Lesson Manifestが不足しています: ${id}`);
        return manifest;
      }),
    ),
  );
  return { index, lessons };
}

/** Indexと全Lesson Manifestを検証し、元の完全なCourseへ再結合する。 */
export function reconstructCourseManifest(
  indexInput: CourseIndex,
  lessonInputs: readonly LessonManifest[],
): CourseManifest {
  const index = CourseIndexSchema.parse(indexInput);
  const expectedOutlines = index.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );
  const expectedIds = new Set(expectedOutlines.map(({ id }) => id));
  const lessonsById = new Map<string, LessonManifest>();
  for (const input of lessonInputs) {
    const manifest = LessonManifestSchema.parse(input);
    if (lessonsById.has(manifest.lessonId)) {
      throw new Error(`Lesson Manifest IDが重複しています: ${manifest.lessonId}`);
    }
    if (!expectedIds.has(manifest.lessonId)) {
      throw new Error(`Indexにない余分なLesson Manifestです: ${manifest.lessonId}`);
    }
    if (manifest.courseId !== index.id || manifest.courseRevision !== index.revision) {
      throw new Error(
        `Lesson ManifestのCourse IDまたはrevisionが一致しません: ${manifest.lessonId}`,
      );
    }
    lessonsById.set(manifest.lessonId, manifest);
  }
  for (const outline of expectedOutlines) {
    const manifest = lessonsById.get(outline.id);
    if (manifest === undefined) throw new Error(`Lesson Manifestが不足しています: ${outline.id}`);
    if (canonicalSha256(manifest) !== outline.manifestSha256) {
      throw new Error(`Lesson ManifestのSHAが一致しません: ${outline.id}`);
    }
  }

  const course = CourseManifestSchema.parse({
    schemaVersion: 1,
    id: index.id,
    title: index.title,
    description: index.description,
    audience: index.audience,
    estimatedMinutes: index.estimatedMinutes,
    revision: index.revision,
    runnerId: index.runnerId,
    validatorId: index.validatorId,
    glossary: index.glossary,
    concepts: index.concepts,
    supportedDevices: index.supportedDevices,
    prerequisites: index.prerequisites,
    publicationStatus: index.publicationStatus,
    expectedTotals: index.expectedTotals,
    provenanceManifestPath: index.provenanceManifestPath,
    progressMigrations: index.progressMigrations,
    phases: index.phases.map((phase) => ({
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
        lessons: chapter.lessons.map(({ id }) => lessonsById.get(id)!.lesson),
      })),
    })),
  });
  const regeneratedIndex = splitCourseArtifacts(course).index;
  if (stringifyCanonicalJson(regeneratedIndex) !== stringifyCanonicalJson(index)) {
    throw new Error('Course Index outlineがLesson Manifestの内容と一致しません');
  }
  return course;
}
