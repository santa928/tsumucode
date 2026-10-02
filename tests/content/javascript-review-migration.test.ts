import path from 'node:path';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type {
  ExerciseDraft,
  ProgressRepository,
  RepositorySnapshot,
} from '../../src/core/persistence/contracts';

it.each(
  [
    {
      oldRevision: '2026-09-28.19',
      resetIds: ['javascript-ch10-l01', 'javascript-ch10-l02', 'javascript-ch11-l03'],
      stableId: 'javascript-ch00-l01',
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
      stableId: 'javascript-ch00-l01',
    },
  ].flatMap((entry) => ['edge', 'whole-chain'].map((scope) => ({ ...entry, scope }))),
)(
  '$oldRevisionの$scopeで変更演習だけ旧合格を失効し、旧コード全体とbackupを保つ',
  async ({ oldRevision, resetIds, stableId, scope }) => {
    const { runtime: currentCourse } = await loadAuthoringCourse(
      path.resolve('content/javascript'),
    );
    // 旧非empty edgeそのものと現revisionまでのchainを別に検証する。
    const edgeIndex = currentCourse.progressMigrations.findIndex(
      (edge) => edge.fromRevision === oldRevision,
    );
    expect(edgeIndex).toBeGreaterThanOrEqual(0);
    const edge = currentCourse.progressMigrations[edgeIndex]!;
    const course =
      scope === 'edge'
        ? {
            ...currentCourse,
            revision: edge.toRevision,
            progressMigrations: currentCourse.progressMigrations.slice(0, edgeIndex + 1),
          }
        : currentCourse;
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

it('追加25演習だけを末尾edgeで失効し、旧source/snapshot/日時のbackupと別Courseを保つ', async () => {
  const { runtime: course } = await loadAuthoringCourse(path.resolve('content/javascript'));
  const resetIds = [
    'javascript-ch01-l01-e01',
    'javascript-ch01-l02-e01',
    'javascript-ch01-l04-e01',
    'javascript-ch02-l02-e01',
    'javascript-ch02-l03-e01',
    'javascript-ch02-l04-e01',
    'javascript-ch03-l01-e01',
    'javascript-ch03-l03-e01',
    'javascript-ch03-l05-e01',
    'javascript-ch03-l05-e02',
    'javascript-ch03-l05-e03',
    'javascript-ch04-l01-e01',
    'javascript-ch04-l02-e01',
    'javascript-ch04-l03-e01',
    'javascript-ch04-l04-e01',
    'javascript-ch04-l05-e01',
    'javascript-ch05-l01-e01',
    'javascript-ch05-l02-e01',
    'javascript-ch05-l03-e01',
    'javascript-ch05-l04-e01',
    'javascript-ch06-l03-e01',
    'javascript-ch10-l01-e01',
    'javascript-ch10-l02-e01',
    'javascript-ch10-l03-e01',
    'javascript-ch11-l02-e01',
  ];
  const edge = course.progressMigrations.at(-1)!;
  expect(edge.fromRevision).toBe('2026-10-02.3');
  expect(edge.toRevision).toBe(course.revision);
  expect(
    edge.steps.map((step) => (step.action === 'map-to' ? step.fromId : step.id)).sort(),
  ).toEqual([...resetIds].sort());
  expect(
    edge.steps.every((step) => step.entity === 'exercise' && step.action === 'intentionally-reset'),
  ).toBe(true);
  const stable = 'javascript-ch00-l01-e01',
    ids = [...resetIds, stable];
  const lessons: Record<string, RepositorySnapshot['courses'][string]['lessons'][string]> = {};
  const drafts: Record<string, ExerciseDraft> = {};
  for (const exerciseId of ids) {
    const lessonId = exerciseId.replace(/-e\d+$/u, '');
    const prior = lessons[lessonId];
    lessons[lessonId] = {
      lessonId,
      viewedSlideIds: [lessonId + '-s01'],
      currentSlideId: lessonId + '-s01',
      passedExerciseIds: [...(prior?.passedExerciseIds ?? []), exerciseId],
      passedChecklistItemIds: [],
      passedRuleIds: [...(prior?.passedRuleIds ?? []), exerciseId + '-r01'],
      passedViewportIds: ['desktop-1280'],
      currentComplete: true,
      firstCompletedAt: '2026-10-01T00:00:00Z',
    };
    const files = { 'script.js': '// 学習者全文: ' + exerciseId + '\nconst saved = "before";' };
    drafts['javascript:' + exerciseId] = {
      courseId: 'javascript',
      lessonId,
      exerciseId,
      workspaceId: exerciseId,
      contentRevision: '2026-10-02.3',
      editRevision: 7,
      files,
      selectedFile: 'script.js',
      cursors: {},
      validationHistory: [],
      revealedHintIds: [exerciseId + '-h01'],
      lastPassingSnapshots: {
        [exerciseId]: {
          editRevision: 7,
          contentRevision: '2026-10-02.3',
          files,
          evaluatedAt: '2026-10-01T00:00:00Z',
        },
      },
      updatedAt: '2026-10-01T00:00:00Z',
    };
  }
  const js = {
    courseId: 'javascript',
    contentRevision: '2026-10-02.3',
    lessons,
    currentComplete: true,
    firstCompletedAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const other = { ...structuredClone(js), courseId: 'other' };
  const input: RepositorySnapshot = {
    schemaVersion: 2,
    courses: { javascript: js, other },
    drafts,
    quarantined: [],
  };
  let stored = structuredClone(input);
  let backup: RepositorySnapshot | undefined;
  let replacements = 0;
  const repository = {
    snapshot: async () => stored,
    replaceSnapshotWithBackup: async (value: RepositorySnapshot) => {
      backup = structuredClone(stored);
      stored = structuredClone(value);
      replacements += 1;
    },
  } as unknown as ProgressRepository;
  const service = new ContentProgressMigrationService(repository);
  await service.ensureStoredCourse(course);
  expect(backup).toEqual(input);
  expect(replacements).toBe(1);
  for (const exerciseId of resetIds) {
    const lessonId = exerciseId.replace(/-e\d+$/u, '');
    expect(stored.courses.javascript!.lessons[lessonId]).toMatchObject({
      currentComplete: false,
      viewedSlideIds: [lessonId + '-s01'],
      currentSlideId: lessonId + '-s01',
    });
    expect(stored.courses.javascript!.lessons[lessonId]).not.toHaveProperty('firstCompletedAt');
    expect(stored.drafts['javascript:' + exerciseId]).toBeUndefined();
    expect(
      stored.quarantined.some(
        (q) => JSON.stringify(q.raw) === JSON.stringify(input.drafts['javascript:' + exerciseId]),
      ),
    ).toBe(true);
    expect(backup!.drafts['javascript:' + exerciseId]!.lastPassingSnapshots).toEqual(
      input.drafts['javascript:' + exerciseId]!.lastPassingSnapshots,
    );
    expect(backup!.courses.javascript!.lessons[lessonId]!.firstCompletedAt).toBe(
      '2026-10-01T00:00:00Z',
    );
  }
  const stableLesson = stable.replace(/-e\d+$/u, '');
  expect(stored.courses.javascript!.lessons[stableLesson]).toEqual(
    input.courses.javascript!.lessons[stableLesson],
  );
  expect(stored.drafts['javascript:' + stable]!.files).toEqual(
    input.drafts['javascript:' + stable]!.files,
  );
  expect(stored.courses.other).toEqual(other);
  expect(input.courses.javascript!.currentComplete).toBe(true);
  const after = structuredClone(stored);
  await service.ensureStoredCourse(course);
  expect(stored).toEqual(after);
  expect(replacements).toBe(1);
}, 20_000);
