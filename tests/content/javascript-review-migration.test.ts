import path from 'node:path';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type {
  ExerciseDraft,
  ProgressRepository,
  RepositorySnapshot,
} from '../../src/core/persistence/contracts';

it.each([
  {
    oldRevision: '2026-09-28.19',
    resetIds: ['javascript-ch10-l01', 'javascript-ch10-l02', 'javascript-ch11-l03'],
    stableId: 'javascript-ch11-l02',
  },
  {
    oldRevision: '2026-10-02.1',
    resetIds: [
      'javascript-ch01-l03',
      'javascript-ch02-l01',
      'javascript-ch03-l02',
      'javascript-ch03-l04',
      'javascript-ch06-l04',
    ],
    stableId: 'javascript-ch01-l02',
  },
])(
  '$oldRevisionの変更演習だけ旧合格を失効し、旧コード全体とbackupを保つ',
  async ({ oldRevision, resetIds, stableId }) => {
    const { runtime: course } = await loadAuthoringCourse(path.resolve('content/javascript'));
    const ids = [...resetIds, stableId];
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
    let stored = input;
    let backup: RepositorySnapshot | undefined;
    const repository = {
      snapshot: async () => stored,
      replaceSnapshotWithBackup: async (value: RepositorySnapshot) => {
        backup = structuredClone(stored);
        stored = structuredClone(value);
      },
    } as unknown as ProgressRepository;
    const service = new ContentProgressMigrationService(repository);
    service.registerCourse(course);
    const outcome = await service.migrateSnapshotWithNotices(input);
    for (const id of resetIds) {
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
    expect(outcome.snapshot.courses.javascript!.lessons[stableId]).toEqual(lessons[stableId]);
    expect(outcome.snapshot.drafts['javascript:' + stableId + '-e01']?.files).toEqual(
      drafts['javascript:' + stableId + '-e01']!.files,
    );
    expect(outcome.snapshot.courses.javascript?.currentComplete).toBe(false);
    expect(input.courses.javascript?.lessons[ids[0]!]!.currentComplete).toBe(true);
    await service.ensureStoredCourse(course);
    expect(backup).toEqual(input);
    for (const id of resetIds) {
      expect(backup?.courses.javascript?.lessons[id]?.firstCompletedAt).toBe(
        '2026-10-01T00:00:00Z',
      );
    }
    expect(stored.drafts['javascript:' + resetIds[0]! + '-e01']).toBeUndefined();
    expect(
      stored.quarantined.some(
        ({ raw }) =>
          JSON.stringify(raw) === JSON.stringify(drafts['javascript:' + resetIds[0]! + '-e01']),
      ),
    ).toBe(true);
  },
  20_000,
);
