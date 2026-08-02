/** 分割配信するCatalog、Course Index、Lesson Manifestの公開契約を定義する。 */
import { z } from 'zod';
import { resolvePublicAsset } from '../../shared/lib/resolvePublicAsset';
import {
  ConceptDefinitionSchema,
  ContentProgressMigrationSchema,
  CourseCatalogLessonStartSchema,
  ExpectedTotalsSchema,
  GlossaryEntrySchema,
  IdSchema,
  LearningPathDefinitionSchema,
  LessonSchema,
  NonEmptyTextSchema,
  RelativePathSchema,
  Sha256Schema,
  SupportedDevicesSchema,
} from './schema';

type IssuePath = readonly (string | number)[];

/** Refinement issueへ複製したpathと日本語messageを追加する。 */
function addIssue(context: z.RefinementCtx, path: IssuePath, message: string): void {
  context.addIssue({ code: 'custom', path: [...path], message });
}

/** 配列に同じ文字列が複数含まれるかを返す。 */
function hasDuplicateStrings(items: readonly string[]): boolean {
  return new Set(items).size !== items.length;
}

/** 2つの文字列配列が順序を含め完全一致するかを返す。 */
function hasSameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/** 検証済みPublic pathをcanonical pathnameへ変換する。 */
function canonicalPublicPath(path: string): string {
  return resolvePublicAsset('/', path);
}

export const RequiredChecklistItemOutlineSchema = z
  .object({
    id: IdSchema,
    label: NonEmptyTextSchema,
    ruleIds: z.array(IdSchema).min(1),
  })
  .strict();

export const SlideKindSchema = z.enum([
  'concept',
  'comparison',
  'diagram',
  'code',
  'reflection',
  'brief',
  'guide',
  'checklist',
]);

export const SlideOutlineSchema = z
  .object({ id: IdSchema, title: NonEmptyTextSchema, kind: SlideKindSchema })
  .strict();

export const ExerciseOutlineSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    kind: z.enum(['standard', 'guided-project', 'capstone']),
    workspaceId: IdSchema,
  })
  .strict();

const LessonOutlineBaseShape = {
  id: IdSchema,
  title: NonEmptyTextSchema,
  goal: NonEmptyTextSchema,
  estimatedMinutes: z.number().int().positive(),
  prerequisiteLessonIds: z.array(IdSchema),
  nextLessonId: IdSchema.optional(),
  slides: z.array(SlideOutlineSchema),
  exercises: z.array(ExerciseOutlineSchema).min(1),
  manifestPath: RelativePathSchema,
  manifestSha256: Sha256Schema,
};

export const LessonOutlineSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...LessonOutlineBaseShape,
      kind: z.literal('standard'),
      completion: z
        .object({
          kind: z.literal('standard'),
          finalSlideId: IdSchema,
          requiredExerciseIds: z.array(IdSchema).min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...LessonOutlineBaseShape,
      kind: z.literal('guided-project'),
      requiredChecklistItems: z.array(RequiredChecklistItemOutlineSchema),
      completion: z
        .object({
          kind: z.literal('guided-project'),
          requiredChecklistItemIds: z.array(IdSchema).min(1),
          requiredExerciseIds: z.array(IdSchema).min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...LessonOutlineBaseShape,
      kind: z.literal('capstone'),
      requiredChecklistItems: z.array(RequiredChecklistItemOutlineSchema),
      completion: z
        .object({
          kind: z.literal('capstone'),
          requiredRuleIds: z.array(IdSchema).min(1),
          requiredViewportIds: z.array(IdSchema).min(1),
        })
        .strict(),
    })
    .strict(),
]);

export const CourseIndexChapterSchema = z
  .object({
    id: IdSchema,
    sequence: z.number().int().nonnegative(),
    title: NonEmptyTextSchema,
    goal: NonEmptyTextSchema,
    estimatedMinutes: z.number().int().positive(),
    kind: z.enum(['standard', 'guided-project', 'capstone']),
    lessons: z.array(LessonOutlineSchema).min(1),
  })
  .strict();

export const CourseIndexPhaseSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    chapters: z.array(CourseIndexChapterSchema).min(1),
  })
  .strict();

const CourseEntityIdsSchema = z
  .object({
    chapter: z.array(IdSchema),
    lesson: z.array(IdSchema),
    slide: z.array(IdSchema),
    exercise: z.array(IdSchema),
    rule: z.array(IdSchema),
    hint: z.array(IdSchema),
    checklist: z.array(IdSchema),
    workspace: z.array(IdSchema),
  })
  .strict();

const CourseIndexBaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    audience: NonEmptyTextSchema,
    estimatedMinutes: z.number().int().positive(),
    revision: NonEmptyTextSchema,
    runnerId: IdSchema,
    validatorId: IdSchema,
    glossary: z.array(GlossaryEntrySchema),
    concepts: z.array(ConceptDefinitionSchema),
    supportedDevices: SupportedDevicesSchema,
    prerequisites: z.array(IdSchema),
    publicationStatus: z.enum(['draft', 'published']),
    expectedTotals: ExpectedTotalsSchema,
    provenanceManifestPath: RelativePathSchema,
    progressMigrations: z.array(ContentProgressMigrationSchema),
    entityIds: CourseEntityIdsSchema,
    phases: z.array(CourseIndexPhaseSchema).min(1),
  })
  .strict();

type CourseIndexValue = z.infer<typeof CourseIndexBaseSchema>;
type LessonOutlineValue = z.infer<typeof LessonOutlineSchema>;

interface CourseIndexTotals {
  chapters: number;
  lessons: number;
  conceptSlides: number;
  standardExercises: number;
  guidedProjectLessons: number;
  capstoneLessons: number;
  estimatedMinutes: number;
}

/** Course Index内の順序、参照、重複、宣言集計を本文なしで横断検証する。 */
function validateCourseIndex(index: CourseIndexValue, context: z.RefinementCtx): void {
  if (hasDuplicateStrings(index.prerequisites)) {
    addIssue(context, ['prerequisites'], 'Course prerequisite IDが重複しています');
  }
  if (index.prerequisites.includes(index.id)) {
    addIssue(context, ['prerequisites'], 'Courseは自分自身をprerequisiteにできません');
  }
  if (hasDuplicateStrings(index.supportedDevices.study)) {
    addIssue(context, ['supportedDevices', 'study'], 'study対応端末が重複しています');
  }

  const idsByEntity: Record<'chapter' | 'lesson' | 'slide' | 'exercise', string[]> = {
    chapter: [],
    lesson: [],
    slide: [],
    exercise: [],
  };
  const workspaces: string[] = [];
  const phaseIds: string[] = [];
  const manifestPaths: string[] = [];
  const requiredChecklistIds = new Set<string>();
  const lessonOrder = new Map<string, number>();
  const allSlideIds = new Set<string>();
  const allConceptIds = new Set(index.concepts.map(({ id }) => id));
  const totals: CourseIndexTotals = {
    chapters: 0,
    lessons: 0,
    conceptSlides: 0,
    standardExercises: 0,
    guidedProjectLessons: 0,
    capstoneLessons: 0,
    estimatedMinutes: 0,
  };
  let chapterSequence = 0;
  let lessonSequence = 0;

  for (const [phaseIndex, phase] of index.phases.entries()) {
    phaseIds.push(phase.id);
    for (const [chapterIndex, chapter] of phase.chapters.entries()) {
      const chapterPath = ['phases', phaseIndex, 'chapters', chapterIndex] as const;
      idsByEntity.chapter.push(chapter.id);
      totals.chapters += 1;
      if (chapter.sequence !== chapterSequence) {
        addIssue(
          context,
          [...chapterPath, 'sequence'],
          'Chapter sequenceは配列順の0..n-1で指定してください',
        );
      }
      chapterSequence += 1;
      let chapterMinutes = 0;

      for (const [lessonIndex, lesson] of chapter.lessons.entries()) {
        const lessonPath = [...chapterPath, 'lessons', lessonIndex] as const;
        idsByEntity.lesson.push(lesson.id);
        lessonOrder.set(lesson.id, lessonSequence);
        lessonSequence += 1;
        manifestPaths.push(canonicalPublicPath(lesson.manifestPath));
        totals.lessons += 1;
        totals.estimatedMinutes += lesson.estimatedMinutes;
        chapterMinutes += lesson.estimatedMinutes;
        if (lesson.kind === 'guided-project') totals.guidedProjectLessons += 1;
        if (lesson.kind === 'capstone') totals.capstoneLessons += 1;
        if (lesson.kind !== chapter.kind) {
          addIssue(context, [...lessonPath, 'kind'], 'Lesson kindとChapter kindが一致しません');
        }

        const localSlideIds = lesson.slides.map(({ id }) => id);
        const localExerciseIds = lesson.exercises.map(({ id }) => id);
        idsByEntity.slide.push(...localSlideIds);
        idsByEntity.exercise.push(...localExerciseIds);
        workspaces.push(...lesson.exercises.map(({ workspaceId }) => workspaceId));
        for (const slide of lesson.slides) {
          allSlideIds.add(slide.id);
          if (['concept', 'comparison', 'diagram', 'code'].includes(slide.kind)) {
            totals.conceptSlides += 1;
          }
        }
        totals.standardExercises += lesson.exercises.filter(
          ({ kind }) => kind === 'standard',
        ).length;

        if (hasDuplicateStrings(localSlideIds)) {
          addIssue(context, [...lessonPath, 'slides'], 'Lesson内のSlide IDが重複しています');
        }
        if (hasDuplicateStrings(localExerciseIds)) {
          addIssue(context, [...lessonPath, 'exercises'], 'Lesson内のExercise IDが重複しています');
        }
        for (const [exerciseIndex, exercise] of lesson.exercises.entries()) {
          if (exercise.kind !== lesson.kind) {
            addIssue(
              context,
              [...lessonPath, 'exercises', exerciseIndex, 'kind'],
              'Exercise kindとLesson kindが一致しません',
            );
          }
        }
        validateLessonCompletion(
          lesson,
          localSlideIds,
          localExerciseIds,
          index.entityIds,
          requiredChecklistIds,
          context,
          lessonPath,
        );
      }

      if (chapter.estimatedMinutes !== chapterMinutes) {
        addIssue(
          context,
          [...chapterPath, 'estimatedMinutes'],
          `Chapter estimatedMinutes=${String(chapter.estimatedMinutes)} ですがLesson合計は${String(chapterMinutes)}です`,
        );
      }
    }
  }

  if (hasDuplicateStrings(phaseIds)) addIssue(context, ['phases'], 'Phase IDが重複しています');
  if (hasDuplicateStrings(manifestPaths)) {
    addIssue(context, ['phases'], 'Lesson Manifest pathが重複しています');
  }
  for (const [entity, ids] of Object.entries(index.entityIds)) {
    if (hasDuplicateStrings(ids)) {
      addIssue(context, ['entityIds', entity], `entityIds.${entity}が重複しています`);
    }
  }
  for (const entity of ['chapter', 'lesson', 'slide', 'exercise'] as const) {
    const actual = idsByEntity[entity];
    if (hasDuplicateStrings(actual)) {
      addIssue(context, ['phases'], `${entity} IDがCourse内で重複しています`);
    }
    if (!hasSameOrderedStrings(index.entityIds[entity], actual)) {
      addIssue(
        context,
        ['entityIds', entity],
        `entityIds.${entity}とCourse Indexの教材順が一致しません`,
      );
    }
  }
  const orderedWorkspaces = [...new Set(workspaces)];
  if (!hasSameOrderedStrings(index.entityIds.workspace, orderedWorkspaces)) {
    addIssue(
      context,
      ['entityIds', 'workspace'],
      'entityIds.workspaceとExercise workspaceの教材順が一致しません',
    );
  }
  for (const checklistId of requiredChecklistIds) {
    if (!index.entityIds.checklist.includes(checklistId)) {
      addIssue(
        context,
        ['entityIds', 'checklist'],
        `必須Checklist IDがentityIdsにありません: ${checklistId}`,
      );
    }
  }

  validateLessonOrder(index, lessonOrder, context);
  validateGlossaryAndConcepts(index, allSlideIds, allConceptIds, context);
  validateIndexTotals(index, totals, context);
}

/** Lesson種別ごとのcompletion参照をoutline内へ限定する。 */
function validateLessonCompletion(
  lesson: LessonOutlineValue,
  slideIds: readonly string[],
  exerciseIds: readonly string[],
  entityIds: CourseIndexValue['entityIds'],
  requiredChecklistIds: Set<string>,
  context: z.RefinementCtx,
  lessonPath: IssuePath,
): void {
  if (lesson.kind === 'standard') {
    if (lesson.completion.finalSlideId !== slideIds.at(-1)) {
      addIssue(
        context,
        [...lessonPath, 'completion', 'finalSlideId'],
        'finalSlideIdはLesson末尾Slideと一致させてください',
      );
    }
    validateRequiredIds(
      lesson.completion.requiredExerciseIds,
      exerciseIds,
      context,
      [...lessonPath, 'completion', 'requiredExerciseIds'],
      'Exercise',
    );
    return;
  }

  const checklistIds = lesson.requiredChecklistItems.map(({ id }) => id);
  if (hasDuplicateStrings(checklistIds)) {
    addIssue(context, [...lessonPath, 'requiredChecklistItems'], 'Checklist IDが重複しています');
  }
  for (const [itemIndex, item] of lesson.requiredChecklistItems.entries()) {
    requiredChecklistIds.add(item.id);
    if (hasDuplicateStrings(item.ruleIds)) {
      addIssue(
        context,
        [...lessonPath, 'requiredChecklistItems', itemIndex, 'ruleIds'],
        'Checklist rule IDが重複しています',
      );
    }
    for (const ruleId of item.ruleIds) {
      if (!entityIds.rule.includes(ruleId)) {
        addIssue(
          context,
          [...lessonPath, 'requiredChecklistItems', itemIndex, 'ruleIds'],
          `Checklist Rule参照先がentityIdsにありません: ${ruleId}`,
        );
      }
    }
  }

  if (lesson.kind === 'guided-project') {
    if (!hasSameOrderedStrings(lesson.completion.requiredChecklistItemIds, checklistIds)) {
      addIssue(
        context,
        [...lessonPath, 'completion', 'requiredChecklistItemIds'],
        'completion requiredChecklistItemIdsと必須Checklist教材順が一致しません',
      );
    }
    validateRequiredIds(
      lesson.completion.requiredExerciseIds,
      exerciseIds,
      context,
      [...lessonPath, 'completion', 'requiredExerciseIds'],
      'Exercise',
    );
    return;
  }

  validateRequiredIds(
    lesson.completion.requiredRuleIds,
    entityIds.rule,
    context,
    [...lessonPath, 'completion', 'requiredRuleIds'],
    'Rule',
  );
  if (hasDuplicateStrings(lesson.completion.requiredViewportIds)) {
    addIssue(
      context,
      [...lessonPath, 'completion', 'requiredViewportIds'],
      'Capstone requiredViewportIdsが重複しています',
    );
  }
}

/** completion配列の重複と参照先存在を検証する。 */
function validateRequiredIds(
  requiredIds: readonly string[],
  availableIds: readonly string[],
  context: z.RefinementCtx,
  path: IssuePath,
  label: string,
): void {
  if (hasDuplicateStrings(requiredIds)) addIssue(context, path, `${label} IDが重複しています`);
  for (const id of requiredIds) {
    if (!availableIds.includes(id)) addIssue(context, path, `${label}参照先がありません: ${id}`);
  }
}

/** Lessonのprerequisiteとnext参照をCourse教材順へ限定する。 */
function validateLessonOrder(
  index: CourseIndexValue,
  lessonOrder: ReadonlyMap<string, number>,
  context: z.RefinementCtx,
): void {
  for (const [phaseIndex, phase] of index.phases.entries()) {
    for (const [chapterIndex, chapter] of phase.chapters.entries()) {
      for (const [lessonIndex, lesson] of chapter.lessons.entries()) {
        const path = [
          'phases',
          phaseIndex,
          'chapters',
          chapterIndex,
          'lessons',
          lessonIndex,
        ] as const;
        const currentOrder = lessonOrder.get(lesson.id)!;
        if (hasDuplicateStrings(lesson.prerequisiteLessonIds)) {
          addIssue(
            context,
            [...path, 'prerequisiteLessonIds'],
            'Lesson prerequisiteが重複しています',
          );
        }
        for (const [prerequisiteIndex, prerequisiteId] of lesson.prerequisiteLessonIds.entries()) {
          const prerequisiteOrder = lessonOrder.get(prerequisiteId);
          const prerequisitePath = [...path, 'prerequisiteLessonIds', prerequisiteIndex] as const;
          if (prerequisiteOrder === undefined) {
            addIssue(context, prerequisitePath, `Lesson参照先がありません: ${prerequisiteId}`);
          } else if (prerequisiteOrder >= currentOrder) {
            addIssue(context, prerequisitePath, 'prerequisiteは先行Lessonだけを参照できます');
          }
        }
        if (lesson.nextLessonId === undefined) continue;
        const nextOrder = lessonOrder.get(lesson.nextLessonId);
        if (nextOrder === undefined) {
          addIssue(context, [...path, 'nextLessonId'], 'next Lesson参照先がありません');
        } else if (nextOrder <= currentOrder) {
          addIssue(
            context,
            [...path, 'nextLessonId'],
            'nextLessonIdは後続Lessonだけを参照できます',
          );
        }
      }
    }
  }
}

/** GlossaryとConceptの参照をIndex内のSlide／Conceptへ限定する。 */
function validateGlossaryAndConcepts(
  index: CourseIndexValue,
  slideIds: ReadonlySet<string>,
  conceptIds: ReadonlySet<string>,
  context: z.RefinementCtx,
): void {
  const glossaryIds = index.glossary.map(({ id }) => id);
  if (hasDuplicateStrings(glossaryIds))
    addIssue(context, ['glossary'], 'Glossary IDが重複しています');
  for (const [entryIndex, entry] of index.glossary.entries()) {
    if (!slideIds.has(entry.firstSlideId)) {
      addIssue(
        context,
        ['glossary', entryIndex, 'firstSlideId'],
        'GlossaryのSlide参照先がありません',
      );
    }
    if (hasDuplicateStrings(entry.relatedIds)) {
      addIssue(context, ['glossary', entryIndex, 'relatedIds'], 'Glossary関連語が重複しています');
    }
    for (const relatedId of entry.relatedIds) {
      if (relatedId === entry.id || !glossaryIds.includes(relatedId)) {
        addIssue(context, ['glossary', entryIndex, 'relatedIds'], 'Glossary関連語参照が不正です');
      }
    }
  }

  const conceptList = index.concepts.map(({ id }) => id);
  if (hasDuplicateStrings(conceptList))
    addIssue(context, ['concepts'], 'Concept IDが重複しています');
  for (const [conceptIndex, concept] of index.concepts.entries()) {
    if (!slideIds.has(concept.introducedBySlideId)) {
      addIssue(
        context,
        ['concepts', conceptIndex, 'introducedBySlideId'],
        'ConceptのSlide参照先がありません',
      );
    }
    if (hasDuplicateStrings(concept.prerequisiteConceptIds)) {
      addIssue(
        context,
        ['concepts', conceptIndex, 'prerequisiteConceptIds'],
        'Concept prerequisiteが重複しています',
      );
    }
    for (const prerequisiteId of concept.prerequisiteConceptIds) {
      if (prerequisiteId === concept.id || !conceptIds.has(prerequisiteId)) {
        addIssue(
          context,
          ['concepts', conceptIndex, 'prerequisiteConceptIds'],
          'Concept prerequisite参照が不正です',
        );
      }
    }
  }
}

/** Course Indexの宣言集計をoutline実集計と照合する。 */
function validateIndexTotals(
  index: CourseIndexValue,
  totals: CourseIndexTotals,
  context: z.RefinementCtx,
): void {
  for (const key of Object.keys(totals) as (keyof CourseIndexTotals)[]) {
    if (key === 'conceptSlides') continue;
    if (index.expectedTotals[key] !== totals[key]) {
      addIssue(context, ['expectedTotals', key], `expectedTotals.${key}と実集計が一致しません`);
    }
  }
  if (totals.conceptSlides < index.expectedTotals.conceptSlides) {
    addIssue(context, ['expectedTotals', 'conceptSlides'], 'Concept Slide数が宣言未満です');
  }
  if (index.estimatedMinutes !== totals.estimatedMinutes) {
    addIssue(context, ['estimatedMinutes'], 'Course estimatedMinutesとLesson合計が一致しません');
  }
}

export const CourseIndexSchema = CourseIndexBaseSchema.superRefine(validateCourseIndex);

export const CourseCatalogEntryV3Schema = z
  .object({
    id: IdSchema,
    title: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    audience: NonEmptyTextSchema,
    estimatedMinutes: z.number().int().positive(),
    revision: NonEmptyTextSchema,
    publicationStatus: z.enum(['draft', 'published']),
    indexPath: RelativePathSchema,
    indexSha256: Sha256Schema,
    lessonStarts: z.array(CourseCatalogLessonStartSchema).min(1),
  })
  .strict();

const CourseCatalogV3BaseSchema = z
  .object({
    schemaVersion: z.literal(3),
    courses: z.array(CourseCatalogEntryV3Schema).min(1),
    learningPaths: z.array(LearningPathDefinitionSchema),
  })
  .strict();

type CourseCatalogV3Value = z.infer<typeof CourseCatalogV3BaseSchema>;

/** Catalog v3のCourse、path、Lesson start、LearningPath参照を横断検証する。 */
function validateCourseCatalogV3(catalog: CourseCatalogV3Value, context: z.RefinementCtx): void {
  const courseIds = new Set<string>();
  const indexPaths = new Set<string>();
  const courseStatusById = new Map<string, 'draft' | 'published'>();
  for (const [courseIndex, course] of catalog.courses.entries()) {
    if (courseIds.has(course.id)) {
      addIssue(
        context,
        ['courses', courseIndex, 'id'],
        `Catalog Course IDが重複しています: ${course.id}`,
      );
    }
    courseIds.add(course.id);
    courseStatusById.set(course.id, course.publicationStatus);
    const canonicalPath = canonicalPublicPath(course.indexPath);
    if (indexPaths.has(canonicalPath)) {
      addIssue(
        context,
        ['courses', courseIndex, 'indexPath'],
        `Catalog Index pathが重複しています: ${canonicalPath}`,
      );
    }
    indexPaths.add(canonicalPath);
    const lessonIds = course.lessonStarts.map(({ lessonId }) => lessonId);
    if (hasDuplicateStrings(lessonIds)) {
      addIssue(
        context,
        ['courses', courseIndex, 'lessonStarts'],
        'Catalog Lesson IDが重複しています',
      );
    }
  }

  const learningPathIds = new Set<string>();
  for (const [pathIndex, learningPath] of catalog.learningPaths.entries()) {
    if (learningPathIds.has(learningPath.id)) {
      addIssue(context, ['learningPaths', pathIndex, 'id'], 'LearningPath IDが重複しています');
    }
    learningPathIds.add(learningPath.id);
    const previousCourseIds = new Set<string>();
    for (const [stepIndex, step] of learningPath.steps.entries()) {
      const stepPath = ['learningPaths', pathIndex, 'steps', stepIndex] as const;
      if (previousCourseIds.has(step.courseId)) {
        addIssue(context, [...stepPath, 'courseId'], 'LearningPath Course Stepが重複しています');
      }
      if (!courseIds.has(step.courseId)) {
        addIssue(context, [...stepPath, 'courseId'], 'LearningPath Course参照先がありません');
      }
      if (
        learningPath.publicationStatus === 'published' &&
        courseStatusById.get(step.courseId) === 'draft'
      ) {
        addIssue(
          context,
          [...stepPath, 'courseId'],
          '公開LearningPathからdraft Courseを参照できません',
        );
      }
      if (hasDuplicateStrings(step.prerequisiteCourseIds)) {
        addIssue(
          context,
          [...stepPath, 'prerequisiteCourseIds'],
          'LearningPath prerequisiteが重複しています',
        );
      }
      for (const prerequisiteId of step.prerequisiteCourseIds) {
        if (!previousCourseIds.has(prerequisiteId)) {
          addIssue(
            context,
            [...stepPath, 'prerequisiteCourseIds'],
            'prerequisiteは先行Courseだけを参照できます',
          );
        }
      }
      previousCourseIds.add(step.courseId);
    }
  }
}

export const CourseCatalogV3Schema = CourseCatalogV3BaseSchema.superRefine(validateCourseCatalogV3);

export const LessonManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: IdSchema,
    courseRevision: NonEmptyTextSchema,
    lessonId: IdSchema,
    lesson: LessonSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.lesson.id !== manifest.lessonId) {
      addIssue(context, ['lessonId'], 'Lesson IDが一致しません');
    }
  });
