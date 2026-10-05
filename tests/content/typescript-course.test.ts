// @vitest-environment node
/** 導入教材のCourse登録で、順序・初出・採点・配信境界の回帰を検出する。 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { splitCourseArtifacts } from '../../scripts/content/splitCourseArtifacts';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import { recordSlideView } from '../../src/core/persistence/progressUpdates';
import type {
  ExerciseDraft,
  ProgressRepository,
  RepositorySnapshot,
} from '../../src/core/persistence/contracts';

describe('TypeScript導入draft Course', () => {
  it('型推論・型注釈から型消去へ進み、用語と概念の初出を一本化する', async () => {
    const authoring = await loadAuthoringCourse(path.resolve('content/typescript'));
    const course = authoring.runtime;
    const lessons = course.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons }) => lessons),
    );
    expect(course.publicationStatus).toBe('draft');
    expect(course.prerequisites).toEqual(['javascript']);
    expect(course.progressMigrations).toEqual([
      { fromRevision: '2026-10-01.1', toRevision: course.revision, steps: [] },
    ]);
    expect(course.expectedTotals).toEqual({
      chapters: 1,
      lessons: 3,
      conceptSlides: 10,
      standardExercises: 3,
      guidedProjectLessons: 0,
      capstoneLessons: 0,
      estimatedMinutes: 45,
    });
    expect(lessons.flatMap(({ slides }) => slides)).toHaveLength(12);
    expect(lessons.map(({ id }) => id)).toEqual([
      'typescript-ch01-l01',
      'typescript-ch01-l02',
      'typescript-ch01-l03',
    ]);
    expect(lessons[1]!.prerequisiteLessonIds).toEqual([lessons[0]!.id]);
    expect(lessons[0]!.nextLessonId).toBe(lessons[1]!.id);
    expect(lessons[2]!.prerequisiteLessonIds).toEqual([lessons[1]!.id]);
    expect(lessons[1]!.nextLessonId).toBe(lessons[2]!.id);
    expect(course.glossary.find(({ id }) => id === 'type-erasure')?.firstSlideId).toBe(
      'typescript-ch01-l03-s01',
    );
    expect(course.glossary.find(({ id }) => id === 'type-inference')?.firstSlideId).toBe(
      'typescript-ch01-l01-s01',
    );
    expect(course.glossary.find(({ id }) => id === 'type-annotation')?.firstSlideId).toBe(
      'typescript-ch01-l02-s01',
    );
    expect(new Set(course.glossary.map(({ id }) => id)).size).toBe(course.glossary.length);
    expect(
      course.concepts.find(({ id }) => id === 'typescript-number-annotation')
        ?.prerequisiteConceptIds,
    ).toEqual(['typescript-number-inference']);
    expect(
      course.concepts.find(({ id }) => id === 'typescript-type-erasure')?.prerequisiteConceptIds,
    ).toEqual(['typescript-number-annotation']);
    expect(authoring.masteryDiagnostics).toEqual([]);
    expect(authoring.missingSlideMetadata).toEqual([]);
    expect(authoring.missingExerciseMetadata).toEqual([]);
  });

  it('推論・注釈の型条件と型消去の動作条件を分け、解答・fixtureを配信しない', async () => {
    const authoring = await loadAuthoringCourse(path.resolve('content/typescript'));
    const artifacts = splitCourseArtifacts(authoring.runtime);
    expect(artifacts.index.publicationStatus).toBe('draft');
    for (const [index, lesson] of artifacts.lessons.entries()) {
      const exercise = lesson.lesson.exercises[0]!;
      expect(exercise.runtime?.kind).toBe('typescript');
      const learningRule = exercise.validationRules.find(
        ({ target }) => target.kind === 'typescript-learning',
      );
      if (index < 2) {
        expect(learningRule?.assertion).toEqual({
          kind: 'typescript-learning',
          profile: index === 0 ? 'score-number-inference-v1' : 'score-number-annotation-v1',
        });
      } else {
        expect(learningRule).toBeUndefined();
        expect(exercise.validationRules[0]?.assertion).toEqual({
          kind: 'javascript-console',
          operator: 'equals',
          expected: [{ level: 'log', text: '2' }],
        });
      }
      expect(exercise).not.toHaveProperty('solutionFiles');
      expect(exercise).not.toHaveProperty('fixtures');
    }
    expect(authoring.exercises.map(({ fixtures }) => fixtures.length)).toEqual([13, 12, 9]);
  });

  it('旧2Lessonの合格と元TS・採点履歴を保持して新Lessonを開始できる', async () => {
    const authoring = await loadAuthoringCourse(path.resolve('content/typescript'));
    const course = authoring.runtime;
    const lessons = course.phases[0]!.chapters[0]!.lessons;
    const now = '2026-10-05T00:00:00.000Z';
    const oldLessons = Object.fromEntries(
      lessons.slice(0, 2).map((lesson) => [
        lesson.id,
        {
          lessonId: lesson.id,
          viewedSlideIds: lesson.slides.map(({ id }) => id),
          passedExerciseIds: lesson.exercises.map(({ id }) => id),
          passedChecklistItemIds: [],
          passedRuleIds: lesson.exercises.flatMap(({ validationRules }) =>
            validationRules.map(({ id }) => id),
          ),
          passedViewportIds: ['desktop-1280'],
          currentComplete: true,
          firstCompletedAt: now,
        },
      ]),
    );
    const exercise = authoring.exercises[1]!;
    const files = Object.fromEntries(
      exercise.solutionFiles.map(({ path, content }) => [path, content]),
    );
    const draft: ExerciseDraft = {
      courseId: course.id,
      lessonId: lessons[1]!.id,
      exerciseId: exercise.id,
      workspaceId: exercise.workspaceId,
      contentRevision: '2026-10-01.1',
      editRevision: 3,
      files,
      selectedFile: 'main.ts',
      cursors: { 'main.ts': { anchor: 2, head: 2 } },
      validationHistory: [
        {
          exerciseId: exercise.id,
          executionRevision: 3,
          status: 'pass',
          checks: [],
          passedRequirementIds: exercise.validationRules.map(({ id }) => id),
          diagnostics: [],
          evaluatedAt: now,
        },
      ],
      revealedHintIds: [exercise.hints[0]!.id],
      lastPassingSnapshots: {
        [exercise.id]: {
          editRevision: 3,
          contentRevision: '2026-10-01.1',
          files,
          evaluatedAt: now,
        },
      },
      updatedAt: now,
    };
    const snapshot: RepositorySnapshot = {
      schemaVersion: 2,
      courses: {
        [course.id]: {
          courseId: course.id,
          contentRevision: '2026-10-01.1',
          lessons: oldLessons,
          currentLessonId: lessons[1]!.id,
          currentComplete: true,
          firstCompletedAt: now,
          updatedAt: now,
        },
      },
      drafts: { [`${course.id}:${exercise.workspaceId}`]: draft },
      quarantined: [],
    };
    // snapshotの純粋移行だけを使い、永続化APIが呼ばれたら失敗させる。
    const repository = new Proxy({} as ProgressRepository, {
      get() {
        throw new Error('この検証では永続状態を変更しません');
      },
    });
    const service = new ContentProgressMigrationService(repository, { now: () => now });
    service.registerCourse(course);
    const migrated = await service.migrateSnapshot(snapshot);
    expect(migrated.courses[course.id]?.lessons).toEqual(oldLessons);
    expect(migrated.drafts[`${course.id}:${exercise.workspaceId}`]).toEqual({
      ...draft,
      contentRevision: course.revision,
      lastPassingSnapshots: {
        [exercise.id]: {
          ...draft.lastPassingSnapshots[exercise.id],
          contentRevision: course.revision,
        },
      },
    });
    expect(migrated.quarantined).toEqual([]);
    expect(snapshot.drafts[`${course.id}:${exercise.workspaceId}`]?.contentRevision).toBe(
      '2026-10-01.1',
    );
    const next = recordSlideView(
      migrated.courses[course.id],
      course,
      lessons[2]!,
      lessons[2]!.slides[0]!.id,
      now,
    );
    expect(next.lessons[lessons[0]!.id]).toEqual(oldLessons[lessons[0]!.id]);
    expect(next.lessons[lessons[1]!.id]).toEqual(oldLessons[lessons[1]!.id]);
    expect(next.currentComplete).toBe(false);
    expect(next.lessons[lessons[2]!.id]?.currentComplete).toBe(false);
  });
});
