// @vitest-environment node
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import { recordSlideView } from '../../src/core/persistence/progressUpdates';
import type { ProgressRepository, RepositorySnapshot } from '../../src/core/persistence/contracts';

it.each(['2026-10-06.1', '2026-10-07.1', '2026-10-07.2', '2026-10-07.3', '2026-10-07.4'])(
  '旧revision %sから保存TSX・履歴・passingSnapshotを保って教材追加へ移行する',
  async (previous) => {
    const { runtime: course, exercises } = await loadAuthoringCourse('content/react');
    const exercise = exercises[0]!;
    const lesson = course.phases[0]!.chapters[0]!.lessons[0]!;
    const now = '2026-10-06T23:00:00.000Z';
    const files = Object.fromEntries(
      exercise.solutionFiles.map((file) => [file.path, file.content]),
    );
    files['main.tsx'] = '// 保存済みの日本語メモ\n' + files['main.tsx']!;
    const history = [
      {
        exerciseId: exercise.id,
        executionRevision: 2,
        status: 'pass' as const,
        checks: [],
        passedRequirementIds: exercise.validationRules.map((rule) => rule.id),
        diagnostics: [],
        evaluatedAt: now,
      },
    ];
    const snapshot: RepositorySnapshot = {
      schemaVersion: 2,
      quarantined: [],
      courses: {
        react: {
          courseId: 'react',
          contentRevision: previous,
          currentLessonId: lesson.id,
          currentChapterId: 'react-ch01',
          currentComplete: true,
          firstCompletedAt: now,
          updatedAt: now,
          lessons: {
            [lesson.id]: {
              lessonId: lesson.id,
              viewedSlideIds: lesson.slides.map((slide) => slide.id),
              passedExerciseIds: [exercise.id],
              passedChecklistItemIds: [],
              passedRuleIds: exercise.validationRules.map((rule) => rule.id),
              passedViewportIds: ['desktop-1280'],
              currentComplete: true,
              firstCompletedAt: now,
            },
          },
        },
      },
      drafts: {
        [`react:${exercise.workspaceId}`]: {
          courseId: 'react',
          lessonId: lesson.id,
          exerciseId: exercise.id,
          workspaceId: exercise.workspaceId,
          contentRevision: previous,
          editRevision: 3,
          files,
          selectedFile: 'main.tsx',
          cursors: { 'main.tsx': { anchor: 5, head: 5 } },
          validationHistory: history,
          revealedHintIds: [exercise.hints[0]!.id],
          updatedAt: now,
          lastPassingSnapshots: {
            [exercise.id]: { editRevision: 2, contentRevision: previous, files, evaluatedAt: now },
          },
        },
      },
    };
    const service = new ContentProgressMigrationService({} as ProgressRepository);
    service.registerCourse(course);
    const migrated = await service.migrateSnapshot(snapshot);
    const draft = migrated.drafts[`react:${exercise.workspaceId}`]!;
    expect(draft.contentRevision).toBe(course.revision);
    expect(draft.files).toEqual(files);
    expect(draft.editRevision).toBe(3);
    expect(draft.selectedFile).toBe('main.tsx');
    expect(draft.cursors).toEqual(snapshot.drafts[`react:${exercise.workspaceId}`]!.cursors);
    expect(draft.validationHistory).toEqual(history);
    expect(draft.revealedHintIds).toEqual([exercise.hints[0]!.id]);
    expect(draft.lastPassingSnapshots[exercise.id]).toEqual({
      editRevision: 2,
      contentRevision: course.revision,
      files,
      evaluatedAt: now,
    });
    expect(migrated.courses['react']!.lessons[lesson.id]!.currentComplete).toBe(true);
    const nextLesson = course.phases[0]!.chapters[0]!.lessons[1]!;
    const viewed = recordSlideView(
      migrated.courses['react'],
      course,
      nextLesson,
      nextLesson.slides[0]!.id,
      now,
    );
    expect(viewed.currentComplete).toBe(false);
    expect(viewed.firstCompletedAt).toBe(now);
    expect(viewed.lessons[lesson.id]!.currentComplete).toBe(true);
    expect(viewed.lessons[nextLesson.id]!.currentComplete).toBe(false);
    expect(migrated.quarantined).toEqual([]);
    expect(snapshot.drafts[`react:${exercise.workspaceId}`]!.contentRevision).toBe(previous);
  },
);
