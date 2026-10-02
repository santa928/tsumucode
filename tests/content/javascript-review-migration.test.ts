import path from 'node:path';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type {
  ExerciseDraft,
  ProgressRepository,
  RepositorySnapshot,
} from '../../src/core/persistence/contracts';

it('変更した3演習の旧合格を失効し、旧コード全体を退避して閲覧と他演習を保つ', async () => {
  const { runtime: course } = await loadAuthoringCourse(path.resolve('content/javascript'));
  const ids = [
    'javascript-ch10-l01',
    'javascript-ch10-l02',
    'javascript-ch11-l03',
    'javascript-ch11-l02',
  ];
  const oldRevision = '2026-09-28.19';
  const drafts: Record<string, ExerciseDraft> = {};
  const lessons: Record<string, RepositorySnapshot['courses'][string]['lessons'][string]> = {};
  for (const lessonId of ids) {
    const exerciseId = lessonId + '-e01';
    const files = { 'script.js': '// 学習者の旧コード: ' + lessonId };
    lessons[lessonId] = {
      lessonId,
      viewedSlideIds: [lessonId + '-s01'],
      currentSlideId: lessonId + '-s01',
      passedExerciseIds: [exerciseId],
      passedChecklistItemIds: [],
      passedRuleIds: [exerciseId + '-r01'],
      passedViewportIds: ['desktop-1280'],
      currentComplete: true,
      firstCompletedAt: '2026-10-01T00:00:00Z',
    };
    drafts['javascript:' + exerciseId] = {
      courseId: 'javascript',
      lessonId,
      exerciseId,
      workspaceId: exerciseId,
      contentRevision: oldRevision,
      editRevision: 1,
      files,
      selectedFile: 'script.js',
      cursors: {},
      validationHistory: [],
      revealedHintIds: [],
      lastPassingSnapshots: {
        [exerciseId]: {
          editRevision: 1,
          contentRevision: oldRevision,
          files,
          evaluatedAt: '2026-10-01T00:00:00Z',
        },
      },
      updatedAt: '2026-10-01T00:00:00Z',
    };
  }
  const input: RepositorySnapshot = {
    schemaVersion: 2,
    courses: {
      javascript: {
        courseId: 'javascript',
        contentRevision: oldRevision,
        lessons,
        currentComplete: true,
        updatedAt: '2026-10-01T00:00:00Z',
      },
    },
    drafts,
    quarantined: [],
  };
  const service = new ContentProgressMigrationService({} as ProgressRepository);
  service.registerCourse(course);
  const outcome = await service.migrateSnapshotWithNotices(input);
  for (const id of ids.slice(0, 3)) {
    expect(outcome.snapshot.courses.javascript!.lessons[id]).toMatchObject({
      currentComplete: false,
      passedExerciseIds: [],
      passedRuleIds: [],
      passedViewportIds: [],
      viewedSlideIds: [id + '-s01'],
      currentSlideId: id + '-s01',
    });
    expect(outcome.snapshot.drafts['javascript:' + id + '-e01']).toBeUndefined();
    expect(
      outcome.snapshot.quarantined.some(
        (record) => record.raw === drafts['javascript:' + id + '-e01'],
      ),
    ).toBe(true);
    expect(
      outcome.notices.some(
        (notice) =>
          notice.courseId === 'javascript' &&
          notice.sourceId === id + '-e01' &&
          notice.reason.includes('旧コード'),
      ),
    ).toBe(true);
  }
  const stableId = ids[3]!;
  expect(outcome.snapshot.courses.javascript!.lessons[stableId]).toEqual(lessons[stableId]);
  expect(outcome.snapshot.drafts['javascript:' + stableId + '-e01']?.files).toEqual(
    drafts['javascript:' + stableId + '-e01']!.files,
  );
  expect(outcome.snapshot.courses.javascript?.currentComplete).toBe(false);
  expect(input.courses.javascript?.lessons[ids[0]!]!.currentComplete).toBe(true);
}, 20_000);
