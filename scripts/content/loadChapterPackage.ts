import path from 'node:path';
import type { SlideBlock } from '../../src/core/content/types';
import { readBinaryFile, readUtf8File, readYamlFile } from './io';
import { parseSlideMarkdown } from './markdown';
import {
  ChapterSourceSchema,
  ExerciseSourceSchema,
  LessonSourceSchema,
  SlideFrontmatterSchema,
  type ChapterSource,
  type ExerciseSource,
  type LessonSource,
  type SlideFrontmatter,
} from './sourceSchema';

export interface LoadedSlideSource {
  readonly sourcePath: string;
  readonly frontmatter: SlideFrontmatter;
  readonly blocks: readonly SlideBlock[];
}

export interface LoadedChapterPackage {
  readonly chapter: ChapterSource;
  readonly lessons: readonly LessonSource[];
  readonly slides: readonly LoadedSlideSource[];
  readonly exercises: readonly ExerciseSource[];
}

/** POSIX相対pathのowner directoryをplatform pathへ安全に結合する。 */
function ownerDirectory(root: string, sourcePath: string): string {
  const directory = path.posix.dirname(sourcePath);
  return directory === '.' ? root : path.join(root, ...directory.split('/'));
}

/** Exerciseが参照する公開・Solution・Fixture・Asset Sourceの存在をすべて確認する。 */
async function assertExerciseFiles(exerciseDir: string, exercise: ExerciseSource): Promise<void> {
  const sources = [
    exercise.instructionsSource,
    ...exercise.files.map(({ source }) => source),
    ...exercise.solutionFiles.map(({ source }) => source),
    ...exercise.fixtures.flatMap(({ files }) => files.map(({ source }) => source)),
    ...exercise.assets.map(({ source }) => source),
  ];
  await Promise.all(sources.map((source) => readBinaryFile(exerciseDir, source)));
}

/** Lesson内のSlide、Exercise、Hint、Project completion参照を相互検証する。 */
function assertLessonReferences(
  lesson: LessonSource,
  slides: readonly LoadedSlideSource[],
  exercises: readonly ExerciseSource[],
): void {
  const slideIds = new Set(slides.map(({ frontmatter }) => frontmatter.id));
  const exerciseIds = new Set(exercises.map(({ id }) => id));
  const rules = exercises.flatMap(({ validationRules }) => validationRules);
  const ruleOrGroupIds = new Set(
    rules.flatMap(({ id, groupId }) => (groupId === undefined ? [id] : [id, groupId])),
  );
  const hintIds = new Set(exercises.flatMap(({ hints }) => hints.map(({ id }) => id)));

  for (const exercise of exercises) {
    for (const slideId of exercise.relatedSlideIds) {
      if (!slideIds.has(slideId))
        throw new Error(`Exerciseの関連Slide参照先がありません: ${slideId}`);
    }
    for (const rule of exercise.validationRules) {
      if (!slideIds.has(rule.relatedSlideId)) {
        throw new Error(`Ruleの関連Slide参照先がありません: ${rule.relatedSlideId}`);
      }
      if (!hintIds.has(rule.hintId))
        throw new Error(`RuleのHint参照先がありません: ${rule.hintId}`);
    }
    for (const hint of exercise.hints) {
      const relatedSlideId = hint.relatedSlideId;
      if (relatedSlideId === undefined) {
        throw new Error(`Hintに関連Slide参照がありません: ${hint.id}`);
      }
      if (!slideIds.has(relatedSlideId)) {
        throw new Error(`Hintの関連Slide参照先がありません: ${relatedSlideId}`);
      }
    }
  }

  if (lesson.kind === 'standard') {
    if (!slideIds.has(lesson.completion.finalSlideId)) {
      throw new Error(`Lesson最終Slide参照先がありません: ${lesson.completion.finalSlideId}`);
    }
    for (const exerciseId of lesson.completion.requiredExerciseIds) {
      if (!exerciseIds.has(exerciseId)) {
        throw new Error(`Lesson必須Exercise参照先がありません: ${exerciseId}`);
      }
    }
    return;
  }

  const checklistIds = new Set(lesson.project.checklist.map(({ id }) => id));
  for (const item of lesson.project.checklist) {
    for (const ruleId of item.ruleIds) {
      if (!ruleOrGroupIds.has(ruleId)) {
        throw new Error(`Project ChecklistのRule参照先がありません: ${ruleId}`);
      }
    }
  }
  if (lesson.kind === 'guided-project') {
    for (const itemId of lesson.completion.requiredChecklistItemIds) {
      if (!checklistIds.has(itemId)) {
        throw new Error(`Guided ProjectのChecklist参照先がありません: ${itemId}`);
      }
    }
    for (const exerciseId of lesson.completion.requiredExerciseIds) {
      if (!exerciseIds.has(exerciseId)) {
        throw new Error(`Guided ProjectのExercise参照先がありません: ${exerciseId}`);
      }
    }
    return;
  }

  for (const ruleId of lesson.completion.requiredRuleIds) {
    if (!ruleOrGroupIds.has(ruleId)) {
      throw new Error(`CapstoneのRule参照先がありません: ${ruleId}`);
    }
  }
  const viewportIds = new Set(
    exercises.flatMap(({ previewViewports }) => previewViewports.map(({ id }) => id)),
  );
  for (const viewportId of lesson.completion.requiredViewportIds) {
    if (!viewportIds.has(viewportId)) {
      throw new Error(`CapstoneのViewport参照先がありません: ${viewportId}`);
    }
  }
}

/** Chapterと配下SourceをFoundation schema、実File、相互参照込みで検証して返す。 */
export async function loadChapterPackage(chapterSourcePath: string): Promise<LoadedChapterPackage> {
  const absoluteChapterPath = path.resolve(chapterSourcePath);
  const chapterDir = path.dirname(absoluteChapterPath);
  const chapter = await readYamlFile(
    chapterDir,
    path.basename(absoluteChapterPath),
    ChapterSourceSchema,
  );
  const lessons: LessonSource[] = [];
  const slides: LoadedSlideSource[] = [];
  const exercises: ExerciseSource[] = [];

  for (const lessonSource of chapter.lessonSources) {
    const lesson = await readYamlFile(chapterDir, lessonSource, LessonSourceSchema);
    const lessonDir = ownerDirectory(chapterDir, lessonSource);
    const lessonSlides: LoadedSlideSource[] = [];
    const lessonExercises: ExerciseSource[] = [];

    for (const slideSource of lesson.slideSources) {
      const parsed = parseSlideMarkdown(await readUtf8File(lessonDir, slideSource));
      const slide = {
        sourcePath: path.join(lessonDir, ...slideSource.split('/')),
        frontmatter: SlideFrontmatterSchema.parse(parsed.frontmatter),
        blocks: parsed.blocks,
      } satisfies LoadedSlideSource;
      lessonSlides.push(slide);
      slides.push(slide);
    }

    if (lesson.kind !== 'standard') {
      await readBinaryFile(lessonDir, lesson.project.briefSource);
      await Promise.all(
        lesson.project.guideSources.map((source) => readBinaryFile(lessonDir, source)),
      );
    }

    for (const exerciseSource of lesson.exerciseSources) {
      const exercise = await readYamlFile(lessonDir, exerciseSource, ExerciseSourceSchema);
      const exerciseDir = ownerDirectory(lessonDir, exerciseSource);
      await assertExerciseFiles(exerciseDir, exercise);
      lessonExercises.push(exercise);
      exercises.push(exercise);
    }

    assertLessonReferences(lesson, lessonSlides, lessonExercises);
    lessons.push(lesson);
  }

  return { chapter, lessons, slides, exercises };
}
