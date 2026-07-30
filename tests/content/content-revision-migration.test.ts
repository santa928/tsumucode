import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { CourseManifestSchema } from '../../src/core/content/schema';
import type { CourseManifest, Exercise, Lesson } from '../../src/core/content/types';
import type {
  ExerciseDraft,
  ProgressRepository,
  RepositorySnapshot,
} from '../../src/core/persistence/contracts';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import { recordSlideView } from '../../src/core/persistence/progressUpdates';

const PREVIOUS_REVISION = '2026-07-13.1';
const CURRENT_REVISION = '2026-07-29.1';
const UPDATED_STARTER_WORKSPACE_IDS = [
  'html-css-capstone-landing',
  'html-css-ch00-l01-e01',
  'html-css-ch00-l02-e01',
  'html-css-ch01-l01-e01',
  'html-css-ch01-l02-e01',
  'html-css-ch01-l03-e01',
  'html-css-ch02-l01-e01',
  'html-css-ch02-l02-e01',
  'html-css-ch03-l01-e01',
  'html-css-ch03-l02-e01',
  'html-css-ch04-l02-e01',
  'html-css-ch04-l04-e01',
  'html-css-ch05-l02-e01',
  'html-css-ch05-l03-e01',
  'html-css-ch05-l04-e01',
  'html-css-ch05-l05-e01',
  'html-css-ch06-l01-e01',
  'html-css-ch06-l02-e01',
  'html-css-ch06-l03-e01',
  'html-css-ch06-l04-e01',
  'html-css-ch08-l02-e01',
  'html-css-ch08-l03-e01',
  'html-css-ch08-l04-e01',
  'html-css-ch08-l05-e01',
  'html-css-ch09-l01-e01',
  'html-css-ch09-l02-e01',
  'html-css-ch09-l03-e01',
  'html-css-ch09-l04-e01',
  'html-css-ch10-l01-e01',
  'html-css-ch10-l02-e01',
  'html-css-ch10-l03-e01',
  'html-css-ch10-l04-e01',
  'html-css-ch10-l05-e01',
  'html-css-ch11-l01-e01',
  'html-css-ch11-l02-e01',
  'html-css-ch11-l04-e01',
  'html-css-profile-project',
] as const;
const COMPLETED_AT = '2026-07-13T12:00:00.000Z';

let course: CourseManifest;
let lessons: readonly Lesson[];
let exercises: readonly Exercise[];

beforeAll(async () => {
  course = CourseManifestSchema.parse(
    JSON.parse(await readFile('public/generated/content/courses/html-css.json', 'utf8')) as unknown,
  );
  lessons = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons: chapterLessons }) => chapterLessons),
  );
  exercises = lessons.flatMap(({ exercises: lessonExercises }) => lessonExercises);
});

/** 現Courseの全合格evidenceと代表passing historyを持つ旧revision snapshotを組み立てる。 */
function completedPreviousRevisionSnapshot(): RepositorySnapshot {
  const currentLessonId = lessons.at(-1)?.id;
  const currentChapterId = course.phases.at(-1)?.chapters.at(-1)?.id;
  const lessonProgress = Object.fromEntries(
    lessons.map((lesson) => {
      const lessonExerciseIds = lesson.exercises.map(({ id }) => id);
      const currentSlideId = lesson.slides.at(-1)?.id;
      return [
        lesson.id,
        {
          lessonId: lesson.id,
          viewedSlideIds: lesson.slides.map(({ id }) => id),
          ...(currentSlideId === undefined ? {} : { currentSlideId }),
          passedExerciseIds: lessonExerciseIds,
          passedChecklistItemIds:
            lesson.kind === 'guided-project'
              ? lesson.project.checklist.filter(({ required }) => required).map(({ id }) => id)
              : [],
          passedRuleIds: [
            ...new Set(
              lesson.exercises.flatMap(({ validationRules }) =>
                validationRules.map(({ groupId, id }) => groupId ?? id),
              ),
            ),
          ],
          passedViewportIds: [
            ...new Set(
              lesson.exercises.flatMap(({ previewViewports }) =>
                previewViewports.map(({ id }) => id),
              ),
            ),
          ],
          currentComplete: true,
          firstCompletedAt: COMPLETED_AT,
        },
      ];
    }),
  );
  const draftByWorkspace = new Map<string, ExerciseDraft>();
  for (const [index, exercise] of exercises.entries()) {
    const lesson = lessons.find(({ exercises: items }) =>
      items.some(({ id }) => id === exercise.id),
    );
    if (lesson === undefined) throw new Error(`ExerciseのLessonがありません: ${exercise.id}`);
    const files = Object.fromEntries(exercise.files.map(({ path, content }) => [path, content]));
    const validationHistory =
      index === 0
        ? [
            {
              exerciseId: exercise.id,
              executionRevision: 1,
              status: 'pass' as const,
              checks: [],
              passedRequirementIds: exercise.validationRules.map(
                ({ groupId, id }) => groupId ?? id,
              ),
              diagnostics: [],
              evaluatedAt: COMPLETED_AT,
            },
          ]
        : [];
    draftByWorkspace.set(exercise.workspaceId, {
      courseId: course.id,
      lessonId: lesson.id,
      exerciseId: exercise.id,
      workspaceId: exercise.workspaceId,
      contentRevision: PREVIOUS_REVISION,
      editRevision: 1,
      files,
      selectedFile: exercise.files[0]?.path ?? 'index.html',
      cursors: {},
      validationHistory,
      revealedHintIds: [],
      lastPassingSnapshots: {
        [exercise.id]: {
          editRevision: 1,
          contentRevision: PREVIOUS_REVISION,
          files,
          evaluatedAt: COMPLETED_AT,
        },
      },
      updatedAt: COMPLETED_AT,
    });
  }
  return {
    schemaVersion: 2,
    courses: {
      [course.id]: {
        courseId: course.id,
        contentRevision: PREVIOUS_REVISION,
        lessons: lessonProgress,
        ...(currentLessonId === undefined ? {} : { currentLessonId }),
        ...(currentChapterId === undefined ? {} : { currentChapterId }),
        currentComplete: true,
        firstCompletedAt: COMPLETED_AT,
        updatedAt: COMPLETED_AT,
      },
    },
    drafts: Object.fromEntries(
      [...draftByWorkspace].map(([workspaceId, draft]) => [`${course.id}:${workspaceId}`, draft]),
    ),
    quarantined: [],
  };
}

describe('HTML/CSS content revision migration', () => {
  it('直前revisionから現revisionへ全ExerciseとStarter変更Workspaceを明示resetする', () => {
    const edge = course.progressMigrations.find(
      ({ fromRevision, toRevision }) =>
        fromRevision === PREVIOUS_REVISION && toRevision === CURRENT_REVISION,
    );
    expect(course.revision).toBe(CURRENT_REVISION);
    expect(edge).toBeDefined();
    const resetIds = (entity: 'exercise' | 'workspace') =>
      edge?.steps
        .flatMap((step) =>
          step.action === 'intentionally-reset' && step.entity === entity ? [step.id] : [],
        )
        .toSorted() ?? [];

    expect(resetIds('exercise')).toEqual(exercises.map(({ id }) => id).toSorted());
    expect(resetIds('workspace')).toEqual([...UPDATED_STARTER_WORKSPACE_IDS].toSorted());
  });

  it('旧revisionの合格状態とDraftを再利用せず、閲覧Slideだけを保持する', async () => {
    const input = completedPreviousRevisionSnapshot();
    const service = new ContentProgressMigrationService({} as ProgressRepository, {
      now: () => '2026-07-29T00:00:00.000Z',
      id: () => 'content-revision-reset',
    });
    service.registerCourse(course);

    const result = await service.migrateSnapshot(input);
    const progress = result.courses[course.id];

    expect(progress).toMatchObject({
      contentRevision: CURRENT_REVISION,
      currentComplete: false,
    });
    expect(progress).not.toHaveProperty('firstCompletedAt');
    expect(result.drafts).toEqual({});
    for (const lesson of lessons) {
      const before = input.courses[course.id]?.lessons[lesson.id];
      const after = progress?.lessons[lesson.id];
      expect(after?.viewedSlideIds, lesson.id).toEqual(before?.viewedSlideIds);
      expect(after?.passedExerciseIds, lesson.id).toEqual([]);
      expect(after?.passedChecklistItemIds, lesson.id).toEqual([]);
      expect(after?.passedRuleIds, lesson.id).toEqual([]);
      expect(after?.passedViewportIds, lesson.id).toEqual([]);
      expect(after?.currentComplete, lesson.id).toBe(false);
      expect(after, lesson.id).not.toHaveProperty('firstCompletedAt');
    }
    expect(JSON.stringify(result.drafts)).not.toContain('lastPassingSnapshots');
    expect(JSON.stringify(result.drafts)).not.toContain('validationHistory');

    const capstone = lessons.find(({ kind }) => kind === 'capstone');
    const capstoneSlideId = capstone?.slides.at(-1)?.id;
    if (progress === undefined || capstone === undefined || capstoneSlideId === undefined) {
      throw new Error('Capstone再計算検証に必要な教材がありません');
    }
    const recalculated = recordSlideView(
      progress,
      course,
      capstone,
      capstoneSlideId,
      '2026-07-29T00:01:00.000Z',
    );
    expect(recalculated.lessons[capstone.id]?.currentComplete).toBe(false);
    expect(recalculated.currentComplete).toBe(false);
  });
});
