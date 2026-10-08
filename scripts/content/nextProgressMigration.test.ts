import { expect, it } from 'vitest';
import { loadAuthoringCourse } from './compileCourse';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import { TransferService } from '../../src/core/persistence/transferService';
import type { ProgressRepository, RepositorySnapshot } from '../../src/core/persistence/contracts';
import { projectDraft } from '../../src/features/learning/local/localProjectProgress';

/** #132の端末保存・JSONを新教材へ移し、既存Lessonの合格と下書きを保持する。 */
it('旧Next revisionの保存とJSONを移行し、追加LessonをCourse完了へ要求する', async () => {
  const { runtime, exercises } = await loadAuthoringCourse('content/next');
  const lesson = runtime.phases[0]!.chapters[0]!.lessons[0]!;
  const exercise = exercises[0]!;
  const files = Object.fromEntries(
    exercise.solutionFiles.map(({ path, content }) => [path, content]),
  );
  const now = '2026-10-08T00:00:00.000Z';
  const draft = projectDraft(files, {
    courseId: 'next',
    lessonId: lesson.id,
    exerciseId: exercise.id,
    workspaceId: exercise.workspaceId,
    ruleId: exercise.validationRules[0]!.id,
    requirementId: exercise.validationRules[0]!.id,
    revision: '2026-10-08.1',
    selectedFile: 'app/page.tsx',
    profile: 'next-project-v1',
  });
  const input: RepositorySnapshot = {
    schemaVersion: 2,
    courses: {
      next: {
        courseId: 'next',
        contentRevision: '2026-10-08.1',
        currentComplete: true,
        firstCompletedAt: now,
        updatedAt: now,
        lessons: {
          [lesson.id]: {
            lessonId: lesson.id,
            viewedSlideIds: lesson.slides.map(({ id }) => id),
            currentSlideId: lesson.slides.at(-1)!.id,
            passedExerciseIds: [exercise.id],
            passedRuleIds: [exercise.validationRules[0]!.id],
            passedChecklistItemIds: [],
            passedViewportIds: ['desktop-1280'],
            currentComplete: true,
            firstCompletedAt: now,
          },
        },
      },
    },
    drafts: {
      [`next:${exercise.workspaceId}`]: {
        ...draft,
        lastPassingSnapshots: {
          [exercise.id]: {
            files,
            editRevision: draft.editRevision,
            contentRevision: '2026-10-08.1',
            evaluatedAt: now,
          },
        },
      },
    },
    quarantined: [],
  };
  let stored = structuredClone(input);
  let backup: RepositorySnapshot | undefined;
  const repository = {
    snapshot: async () => structuredClone(stored),
    replaceSnapshotWithBackup: async (value: RepositorySnapshot) => {
      backup = structuredClone(stored);
      stored = structuredClone(value);
    },
  } as unknown as ProgressRepository;
  const migration = new ContentProgressMigrationService(repository);
  const legacy = await new TransferService(repository, migration, {
    appVersion: 'fixture',
    now: () => now,
  }).exportAll();
  await migration.ensureStoredCourse(runtime);
  expect(backup).toEqual(input);
  expect(stored.courses.next!.contentRevision).toBe(runtime.revision);
  expect(stored.courses.next!.currentComplete).toBe(false);
  expect(stored.courses.next!.lessons[lesson.id]).toEqual(input.courses.next!.lessons[lesson.id]);
  expect(stored.drafts[`next:${exercise.workspaceId}`]!.files).toEqual(files);
  expect(
    stored.drafts[`next:${exercise.workspaceId}`]!.lastPassingSnapshots[exercise.id]!
      .contentRevision,
  ).toBe(runtime.revision);
  expect(stored.quarantined).toEqual([]);
  const empty: RepositorySnapshot = { schemaVersion: 2, courses: {}, drafts: {}, quarantined: [] };
  stored = empty;
  const transfer = new TransferService(repository, migration, {
    appVersion: 'fixture',
    now: () => now,
  });
  const preview = await transfer.prepareImport(legacy);
  expect(stored).toEqual(empty);
  expect(preview.resetNotices).toEqual([]);
  await transfer.applyImport(preview.id);
  expect(backup).toEqual(empty);
  expect(stored.courses.next!.currentComplete).toBe(false);
  expect(stored.courses.next!.lessons[lesson.id]!.currentComplete).toBe(true);
  expect(stored.drafts[`next:${exercise.workspaceId}`]!.files).toEqual(files);
  expect(stored.drafts[`next:${exercise.workspaceId}`]!.contentRevision).toBe(runtime.revision);
});
