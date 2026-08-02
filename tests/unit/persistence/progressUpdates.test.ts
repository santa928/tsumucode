import { describe, expect, it } from 'vitest';
import type {
  CourseIndex,
  CourseManifest,
  Exercise,
  Lesson,
  LessonOutline,
} from '../../../src/core/content/types';
import type {
  CourseProgress,
  ExerciseDraft,
  LessonProgress,
} from '../../../src/core/persistence/contracts';
import {
  findWorkspaceTargets,
  findWorkspaceValidationTargets,
  recordDraftMutationFromIndex,
  recordSlideView,
  recordSlideViewFromIndex,
  recordValidation,
  recordValidationFromIndex,
  recordWorkspaceDraftMutation,
  recordWorkspaceValidation,
  type WorkspaceValidationTarget,
} from '../../../src/core/persistence/progressUpdates';
import type { ValidationResult } from '../../../src/core/validation/contracts';
import { fixtureCourse, fixtureCourseIndex } from '../../fixtures/course';

const PASSED_AT = '2026-07-10T00:01:00.000Z';
const EDITED_AT = '2026-07-10T00:02:00.000Z';

/** Fixtureの先頭Exerciseを、指定した工程のGuided Project Exerciseへ複製する。 */
function createGuidedExercise(index: number): Exercise {
  const source = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!;
  const ruleId = `rule-step-${String(index)}`;
  const viewportId = `viewport-step-${String(index)}`;

  return {
    ...source,
    id: `exercise-step-${String(index)}`,
    kind: 'guided-project',
    projectId: 'project-profile',
    workspaceId: 'workspace-profile',
    title: `工程${String(index)}`,
    validationRules: [
      {
        ...source.validationRules[0]!,
        id: ruleId,
        label: `工程${String(index)}の要件`,
        viewportIds: [viewportId],
      },
    ],
    previewViewports: [{ id: viewportId, width: 1280, height: 720 }],
  };
}

/** 5 Lessonが同じworkspaceをCourse順で共有するGuided Project Courseを生成する。 */
function createSharedWorkspaceCourse(): CourseManifest {
  const sourcePhase = fixtureCourse.phases[0]!;
  const sourceChapter = sourcePhase.chapters[0]!;
  const sourceLesson = sourceChapter.lessons[0]!;
  const lessons = Array.from({ length: 5 }, (_, offset): Lesson => {
    const index = offset + 1;
    const exercise = createGuidedExercise(index);
    const ruleId = `rule-step-${String(index)}`;

    return {
      ...sourceLesson,
      id: `lesson-step-${String(index)}`,
      kind: 'guided-project',
      title: `工程${String(index)}`,
      exercises: [exercise],
      project: {
        id: 'project-profile',
        brief: sourceLesson.slides[0]!.blocks,
        guide: [],
        checklist: [
          {
            id: `checklist-step-${String(index)}`,
            label: `工程${String(index)}を完成する`,
            required: true,
            ruleIds: [ruleId],
          },
        ],
      },
      completion: {
        kind: 'guided-project',
        requiredChecklistItemIds: [`checklist-step-${String(index)}`],
        requiredExerciseIds: [exercise.id],
      },
    };
  });

  return {
    ...fixtureCourse,
    expectedTotals: {
      chapters: 2,
      lessons: 5,
      conceptSlides: 5,
      standardExercises: 0,
      guidedProjectLessons: 5,
      capstoneLessons: 0,
      estimatedMinutes: 75,
    },
    phases: [
      {
        ...sourcePhase,
        chapters: [
          {
            ...sourceChapter,
            id: 'chapter-profile-foundation',
            kind: 'guided-project',
            lessons: lessons.slice(0, 2),
          },
          {
            ...sourceChapter,
            id: 'chapter-profile-finish',
            sequence: 1,
            kind: 'guided-project',
            lessons: lessons.slice(2),
          },
        ],
      },
    ],
  };
}

/** 純粋進捗fixtureの本文から、Schema検証を伴わず必要なCourse Index outlineを投影する。 */
function createCourseIndex(course: CourseManifest): CourseIndex {
  const projectLesson = (lesson: Lesson): LessonOutline => {
    const common = {
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
      manifestPath: `generated/content/courses/${course.id}/lessons/${lesson.id}.json`,
      manifestSha256: 'a'.repeat(64),
    };
    if (lesson.kind === 'standard') {
      return { ...common, kind: lesson.kind, completion: lesson.completion };
    }
    const requiredChecklistItems = lesson.project.checklist
      .filter(({ required }) => required)
      .map(({ id, label, ruleIds }) => ({ id, label, ruleIds }));
    if (lesson.kind === 'guided-project') {
      return {
        ...common,
        kind: lesson.kind,
        requiredChecklistItems,
        completion: lesson.completion,
      };
    }
    return {
      ...common,
      kind: lesson.kind,
      requiredChecklistItems,
      completion: lesson.completion,
    };
  };

  return {
    ...structuredClone(fixtureCourseIndex),
    id: course.id,
    revision: course.revision,
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
        lessons: chapter.lessons.map(projectLesson),
      })),
    })),
  };
}

/** 指定Lessonが一度完了した状態を、全evidence付きで生成する。 */
function createCompletedLessonProgress(lesson: Lesson, index: number): LessonProgress {
  const exercise = lesson.exercises[0]!;

  return {
    lessonId: lesson.id,
    viewedSlideIds: lesson.slides.map(({ id }) => id),
    ...(lesson.slides.at(-1)?.id === undefined ? {} : { currentSlideId: lesson.slides.at(-1)!.id }),
    passedExerciseIds: [exercise.id],
    passedChecklistItemIds: [`checklist-step-${String(index)}`],
    passedRuleIds: [`rule-step-${String(index)}`],
    passedViewportIds: [`viewport-step-${String(index)}`],
    currentComplete: true,
    firstCompletedAt: `2026-07-0${String(index)}T00:00:00.000Z`,
  };
}

/** 共有workspaceの5工程すべてが完了したCourseProgressを生成する。 */
function createCompletedSharedProgress(course: CourseManifest): CourseProgress {
  const lessons = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons: items }) => items),
  );

  return {
    courseId: course.id,
    contentRevision: course.revision,
    lessons: Object.fromEntries(
      lessons.map((lesson, index) => [lesson.id, createCompletedLessonProgress(lesson, index + 1)]),
    ),
    currentLessonId: 'lesson-step-5',
    currentChapterId: 'chapter-profile-finish',
    currentComplete: true,
    firstCompletedAt: '2026-07-05T00:00:00.000Z',
    updatedAt: '2026-07-05T00:00:00.000Z',
  };
}

/** revision 5へ編集された共有workspace Draftを生成する。 */
function createEditedDraft(course: CourseManifest): ExerciseDraft {
  const targets = findWorkspaceTargets(course, 'exercise-step-3');

  return {
    courseId: course.id,
    lessonId: 'lesson-step-3',
    exerciseId: 'exercise-step-3',
    workspaceId: 'workspace-profile',
    contentRevision: course.revision,
    editRevision: 5,
    files: { 'index.html': '<main>revision 5</main>' },
    selectedFile: 'index.html',
    cursors: { 'index.html': { anchor: 8, head: 8 } },
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: Object.fromEntries(
      targets.map(({ exercise }) => [
        exercise.id,
        {
          editRevision: 4,
          contentRevision: course.revision,
          files: { 'index.html': '<main>revision 4</main>' },
          evaluatedAt: PASSED_AT,
        },
      ]),
    ),
    updatedAt: EDITED_AT,
  };
}

/** 対象Exerciseの指定revisionに対するValidationResultを生成する。 */
function createValidationResult(
  exercise: Exercise,
  executionRevision = 5,
  passedRequirementIds = exercise.validationRules.map(({ groupId, id }) => groupId ?? id),
  status: ValidationResult['status'] = 'pass',
): ValidationResult {
  return {
    exerciseId: exercise.id,
    executionRevision,
    status,
    passedRequirementIds,
    diagnostics: [],
    evaluatedAt: PASSED_AT,
    checks: [],
  };
}

/** 値の入力不変性を検証できる独立copyを生成する。 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('progress updates', () => {
  it('最終slideを見た後に必須exerciseがpassすると初回完了日時を記録する', () => {
    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
    const exercise = lesson.exercises[0]!;
    const viewed = recordSlideView(
      undefined,
      fixtureCourse,
      lesson,
      'slide-html-role',
      '2026-07-10T00:00:00.000Z',
    );
    const completed = recordValidation(
      viewed,
      fixtureCourse,
      lesson,
      exercise,
      createValidationResult(exercise, 1),
    );

    expect(completed.lessons[lesson.id]).toMatchObject({
      currentComplete: true,
      firstCompletedAt: PASSED_AT,
    });
    expect(completed).toMatchObject({
      currentComplete: true,
      firstCompletedAt: PASSED_AT,
    });
  });

  it('Exerciseがpassしても最終Slide未閲覧ならLesson完了にしない', () => {
    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
    const exercise = lesson.exercises[0]!;
    const progress = recordValidation(
      undefined,
      fixtureCourse,
      lesson,
      exercise,
      createValidationResult(exercise, 1),
    );

    expect(progress.lessons[lesson.id]?.currentComplete).toBe(false);
    expect(progress.currentComplete).toBe(false);
  });

  it('共有workspaceの対象をCourse順で返し、再判定対象を現在工程までに限定する', () => {
    const course = createSharedWorkspaceCourse();

    expect(
      findWorkspaceTargets(course, 'exercise-step-3').map(({ exercise }) => exercise.id),
    ).toEqual([
      'exercise-step-1',
      'exercise-step-2',
      'exercise-step-3',
      'exercise-step-4',
      'exercise-step-5',
    ]);
    expect(
      findWorkspaceValidationTargets(course, 'exercise-step-3').map(({ exercise }) => exercise.id),
    ).toEqual(['exercise-step-1', 'exercise-step-2', 'exercise-step-3']);
  });

  it('Course Indexと読込済みLessonだけで現在工程までのworkspace対象を返す', () => {
    const course = createSharedWorkspaceCourse();
    const index = createCourseIndex(course);
    const lessons = course.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons: items }) => items),
    );

    expect(
      findWorkspaceValidationTargets(index, lessons, 'exercise-step-3').map(
        ({ exercise }) => exercise.id,
      ),
    ).toEqual(['exercise-step-1', 'exercise-step-2', 'exercise-step-3']);
  });

  it('Index版workspace対象へ未来工程と別workspaceを含めず、未読込Lessonを拒否する', () => {
    const course = createSharedWorkspaceCourse();
    const lessons = course.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons: items }) => items),
    );
    const foreignCourse = structuredClone(course);
    foreignCourse.phases[0]!.chapters[1]!.lessons[1]!.exercises[0]!.workspaceId =
      'workspace-foreign';
    const index = createCourseIndex(foreignCourse);
    const targets = findWorkspaceValidationTargets(index, lessons, 'exercise-step-3');

    expect(targets.map(({ exercise }) => exercise.id)).toEqual([
      'exercise-step-1',
      'exercise-step-2',
      'exercise-step-3',
    ]);
    expect(() =>
      findWorkspaceValidationTargets(index, lessons.slice(1), 'exercise-step-3'),
    ).toThrow('Workspace Lessonが未読込です: lesson-step-1');
  });

  it('Index版のSlide閲覧・判定・Draft編集が既存版と同じ進捗結果を返す', () => {
    const index = fixtureCourseIndex;
    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
    const exercise = lesson.exercises[0]!;
    const viewed = recordSlideViewFromIndex(
      undefined,
      index,
      lesson,
      'slide-html-role',
      '2026-07-10T00:00:00.000Z',
    );
    const completed = recordValidationFromIndex(
      viewed,
      index,
      lesson,
      exercise,
      createValidationResult(exercise, 1),
    );
    const draft: ExerciseDraft = {
      courseId: index.id,
      lessonId: lesson.id,
      exerciseId: exercise.id,
      workspaceId: exercise.workspaceId,
      contentRevision: index.revision,
      editRevision: 2,
      files: { 'index.html': '<h1>編集後</h1>' },
      selectedFile: 'index.html',
      cursors: {},
      validationHistory: [],
      revealedHintIds: [],
      lastPassingSnapshots: {},
      updatedAt: EDITED_AT,
    };

    expect(completed).toEqual(
      recordValidation(
        recordSlideView(
          undefined,
          fixtureCourse,
          lesson,
          'slide-html-role',
          '2026-07-10T00:00:00.000Z',
        ),
        fixtureCourse,
        lesson,
        exercise,
        createValidationResult(exercise, 1),
      ),
    );
    expect(recordDraftMutationFromIndex(completed, index, lesson, exercise, draft)).toMatchObject({
      lessons: {
        [lesson.id]: {
          passedExerciseIds: [],
          currentComplete: false,
        },
      },
    });
  });

  it('共有workspace編集時に5工程の現在evidenceだけを無効化し、初回完了日時と編集位置を保持する', () => {
    const course = createSharedWorkspaceCourse();
    const progress = createCompletedSharedProgress(course);
    const targets = findWorkspaceTargets(course, 'exercise-step-3');
    const draft = createEditedDraft(course);

    const invalidated = recordWorkspaceDraftMutation(progress, course, targets, draft);

    expect(invalidated).toBeDefined();
    for (const [index, target] of targets.entries()) {
      expect(invalidated?.lessons[target.lesson.id]).toMatchObject({
        passedExerciseIds: [],
        passedChecklistItemIds: [],
        passedRuleIds: [],
        passedViewportIds: [],
        currentComplete: false,
        firstCompletedAt: `2026-07-0${String(index + 1)}T00:00:00.000Z`,
      });
    }
    expect(invalidated).toMatchObject({
      currentLessonId: 'lesson-step-3',
      currentChapterId: 'chapter-profile-finish',
      currentComplete: false,
      firstCompletedAt: '2026-07-05T00:00:00.000Z',
      updatedAt: EDITED_AT,
    });
  });

  it('同一snapshotの再判定batchで現在工程までのGuided evidenceだけを復帰する', () => {
    const course = createSharedWorkspaceCourse();
    const targets = findWorkspaceTargets(course, 'exercise-step-3');
    const draft = createEditedDraft(course);
    const invalidated = recordWorkspaceDraftMutation(
      createCompletedSharedProgress(course),
      course,
      targets,
      draft,
    );
    const validationTargets = findWorkspaceValidationTargets(course, 'exercise-step-3');
    const batch = validationTargets.map((target) => ({
      ...target,
      result: createValidationResult(target.exercise),
    }));

    const revalidated = recordWorkspaceValidation(invalidated, course, batch);

    for (const [index, target] of validationTargets.entries()) {
      expect(revalidated.lessons[target.lesson.id]).toMatchObject({
        passedExerciseIds: [target.exercise.id],
        passedChecklistItemIds: [`checklist-step-${String(index + 1)}`],
        passedRuleIds: [`rule-step-${String(index + 1)}`],
        passedViewportIds: [`viewport-step-${String(index + 1)}`],
        currentComplete: true,
        firstCompletedAt: `2026-07-0${String(index + 1)}T00:00:00.000Z`,
      });
    }
    expect(revalidated.lessons['lesson-step-4']?.currentComplete).toBe(false);
    expect(revalidated.lessons['lesson-step-5']?.currentComplete).toBe(false);
    expect(revalidated).toMatchObject({
      currentLessonId: 'lesson-step-3',
      currentChapterId: 'chapter-profile-finish',
      currentComplete: false,
      firstCompletedAt: '2026-07-05T00:00:00.000Z',
    });
  });

  it('Guided Projectは必須ruleが全て揃った時だけchecklistを完了する', () => {
    const course = createSharedWorkspaceCourse();
    const originalLesson = course.phases[0]!.chapters[0]!.lessons[0]!;
    if (originalLesson.kind !== 'guided-project') {
      throw new Error('Guided Project fixtureが必要です');
    }
    const originalExercise = originalLesson.exercises[0]!;
    const secondRule = {
      ...originalExercise.validationRules[0]!,
      id: 'rule-step-1-detail',
      label: '工程1の詳細要件',
    };
    const exercise: Exercise = {
      ...originalExercise,
      validationRules: [...originalExercise.validationRules, secondRule],
    };
    const lesson = {
      ...originalLesson,
      exercises: [exercise],
      project: {
        ...originalLesson.project,
        checklist: [
          {
            id: 'checklist-step-1',
            label: '工程1を完成する',
            required: true,
            ruleIds: ['rule-step-1', 'rule-step-1-detail'],
          },
        ],
      },
    } as Lesson;

    const guidedCourse: CourseManifest = {
      ...course,
      phases: [
        {
          ...course.phases[0]!,
          chapters: [
            {
              ...course.phases[0]!.chapters[0]!,
              lessons: [lesson],
            },
            ...course.phases[0]!.chapters.slice(1),
          ],
        },
      ],
    };

    const partial = recordValidation(
      undefined,
      guidedCourse,
      lesson,
      exercise,
      createValidationResult(exercise, 5, ['rule-step-1']),
    );
    const complete = recordValidation(
      partial,
      guidedCourse,
      lesson,
      exercise,
      createValidationResult(exercise, 5, ['rule-step-1', 'rule-step-1-detail']),
    );

    expect(partial.lessons[lesson.id]).toMatchObject({
      passedChecklistItemIds: [],
      currentComplete: false,
    });
    expect(complete.lessons[lesson.id]).toMatchObject({
      passedChecklistItemIds: ['checklist-step-1'],
      currentComplete: true,
    });
  });

  it('Capstoneは必須ruleと全required viewportが揃った時だけ完了する', () => {
    const sourceLesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
    const sourceExercise = sourceLesson.exercises[0]!;
    const exercise: Exercise = {
      ...sourceExercise,
      id: 'exercise-capstone',
      kind: 'capstone',
      projectId: 'project-capstone',
      workspaceId: 'workspace-capstone',
      validationRules: [
        {
          ...sourceExercise.validationRules[0]!,
          id: 'rule-capstone',
          viewportIds: ['desktop', 'mobile'],
        },
      ],
      previewViewports: [
        { id: 'desktop', width: 1280, height: 720 },
        { id: 'mobile', width: 390, height: 844 },
      ],
    };
    const lesson: Lesson = {
      ...sourceLesson,
      id: 'lesson-capstone',
      kind: 'capstone',
      exercises: [exercise],
      project: {
        id: 'project-capstone',
        brief: sourceLesson.slides[0]!.blocks,
        guide: [],
        checklist: [
          { id: 'check-capstone', label: '完成', required: true, ruleIds: ['rule-capstone'] },
        ],
      },
      completion: {
        kind: 'capstone',
        requiredRuleIds: ['rule-capstone'],
        requiredViewportIds: ['desktop', 'mobile'],
      },
    };
    const course: CourseManifest = {
      ...fixtureCourse,
      phases: [
        {
          ...fixtureCourse.phases[0]!,
          chapters: [
            {
              ...fixtureCourse.phases[0]!.chapters[0]!,
              kind: 'capstone',
              lessons: [lesson],
            },
          ],
        },
      ],
    };

    const incomplete = recordValidation(
      undefined,
      course,
      lesson,
      exercise,
      createValidationResult(exercise, 5, ['rule-capstone'], 'incomplete'),
    );
    const complete = recordValidation(
      incomplete,
      course,
      lesson,
      exercise,
      createValidationResult(exercise, 5, ['rule-capstone']),
    );

    expect(incomplete.lessons[lesson.id]).toMatchObject({
      passedRuleIds: ['rule-capstone'],
      passedViewportIds: [],
      currentComplete: false,
    });
    expect(complete.lessons[lesson.id]).toMatchObject({
      passedRuleIds: ['rule-capstone'],
      passedViewportIds: ['desktop', 'mobile'],
      currentComplete: true,
    });
  });

  it('公開helperはCourse、Progress、Target、Draft、Resultの入力を変更しない', () => {
    const course = createSharedWorkspaceCourse();
    const progress = createCompletedSharedProgress(course);
    const targets = findWorkspaceTargets(course, 'exercise-step-3');
    const draft = createEditedDraft(course);
    const batch = findWorkspaceValidationTargets(course, 'exercise-step-3').map((target) => ({
      ...target,
      result: createValidationResult(target.exercise),
    }));
    const before = clone({ course, progress, targets, draft, batch });

    const invalidated = recordWorkspaceDraftMutation(progress, course, targets, draft);
    recordWorkspaceValidation(invalidated, course, batch);

    expect({ course, progress, targets, draft, batch }).toEqual(before);
  });

  it('空のworkspace targetと空のvalidation batchを拒否する', () => {
    const course = createSharedWorkspaceCourse();
    const progress = createCompletedSharedProgress(course);
    const draft = createEditedDraft(course);

    expect(() => recordWorkspaceDraftMutation(progress, course, [], draft)).toThrow(
      /workspace|target|空/u,
    );
    expect(() => recordWorkspaceValidation(progress, course, [])).toThrow(/validation|batch|空/u);
  });

  it('Draftと異なるworkspaceを含むtarget batchを拒否する', () => {
    const course = createSharedWorkspaceCourse();
    const progress = createCompletedSharedProgress(course);
    const draft = createEditedDraft(course);
    const validTargets = findWorkspaceTargets(course, 'exercise-step-3');
    const foreignTarget: WorkspaceValidationTarget = {
      lesson: validTargets[0]!.lesson,
      exercise: { ...validTargets[0]!.exercise, workspaceId: 'workspace-foreign' },
    };

    expect(() =>
      recordWorkspaceDraftMutation(progress, course, [...validTargets, foreignTarget], draft),
    ).toThrow(/workspace/u);
  });

  it('同じworkspace・同じexecution revision・Exercise IDでないvalidation batchを拒否する', () => {
    const course = createSharedWorkspaceCourse();
    const progress = createCompletedSharedProgress(course);
    const targets = findWorkspaceValidationTargets(course, 'exercise-step-3');
    const mismatchedExercise = targets.map((target, index) => ({
      ...target,
      result: {
        ...createValidationResult(target.exercise),
        ...(index === 1 ? { exerciseId: 'exercise-foreign' } : {}),
      },
    }));
    const mismatchedRevision = targets.map((target, index) => ({
      ...target,
      result: createValidationResult(target.exercise, index === 2 ? 6 : 5),
    }));
    const mismatchedWorkspace = targets.map((target, index) => ({
      ...target,
      exercise:
        index === 2 ? { ...target.exercise, workspaceId: 'workspace-foreign' } : target.exercise,
      result: createValidationResult(target.exercise),
    }));

    expect(() => recordWorkspaceValidation(progress, course, mismatchedExercise)).toThrow(
      /Exercise|result/u,
    );
    expect(() => recordWorkspaceValidation(progress, course, mismatchedRevision)).toThrow(
      /revision|snapshot/iu,
    );
    expect(() => recordWorkspaceValidation(progress, course, mismatchedWorkspace)).toThrow(
      /workspace/u,
    );
  });
});
