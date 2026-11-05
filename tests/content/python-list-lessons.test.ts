// @vitest-environment node
import { expect, it } from 'vitest';
import { compileCourse } from '../../scripts/content/compileCourse';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type { ProgressRepository, RepositorySnapshot } from '../../src/core/persistence/contracts';

it('既存のList課題の前に生成更新と反復の小課題を配置し、既存IDを維持する', async () => {
  const { runtime: course } = await compileCourse('content/python-basics');
  const lessons = course.phases[0]!.chapters[0]!.lessons;
  const start = lessons.findIndex(({ id }) => id === 'python-basics-ch01-l04');
  expect(lessons.slice(start, start + 5).map(({ id }) => id)).toEqual([
    'python-basics-ch01-l04',
    'python-basics-ch01-l05-values',
    'python-basics-ch01-l05-iterate',
    'python-basics-ch01-l05',
    'python-basics-ch01-l06',
  ]);
  for (let index = start + 1; index <= start + 3; index += 1) {
    expect(lessons[index]!.prerequisiteLessonIds).toEqual([lessons[index - 1]!.id]);
  }
});

it('追加前のList達成と保存Sourceを保持し、新しい2課題を達成済みにしない', async () => {
  const { runtime: course } = await compileCourse('content/python-basics');
  const lessonId = 'python-basics-ch01-l05';
  const lesson = {
    lessonId,
    viewedSlideIds: [`${lessonId}-s01`, `${lessonId}-s02`],
    passedExerciseIds: [`${lessonId}-e01`],
    passedChecklistItemIds: [],
    passedRuleIds: [`${lessonId}-e01-r01`],
    passedViewportIds: ['desktop-1280'],
    currentComplete: true,
  };
  const input: RepositorySnapshot = {
    schemaVersion: 2,
    courses: {
      'python-basics': {
        courseId: 'python-basics',
        contentRevision: '2026-10-28.2',
        currentComplete: true,
        updatedAt: '2026-10-28T00:00:00.000Z',
        lessons: { [lessonId]: lesson },
      },
    },
    drafts: {
      [`python-basics:${lessonId}-e01`]: {
        courseId: 'python-basics',
        lessonId,
        exerciseId: `${lessonId}-e01`,
        workspaceId: `${lessonId}-e01`,
        contentRevision: '2026-10-28.2',
        editRevision: 4,
        files: { 'main.py': '# 自分で残したListのメモ\n' },
        selectedFile: 'main.py',
        cursors: { 'main.py': { anchor: 3, head: 3 } },
        validationHistory: [],
        revealedHintIds: [`${lessonId}-e01-h01`],
        lastPassingSnapshots: {
          [`${lessonId}-e01`]: {
            editRevision: 3,
            contentRevision: '2026-10-28.2',
            files: { 'main.py': '# 保存済みの合格Source\n' },
            evaluatedAt: '2026-10-28T00:00:00.000Z',
          },
        },
        updatedAt: '2026-10-28T00:00:00.000Z',
      },
    },
    quarantined: [],
  };
  const service = new ContentProgressMigrationService({} as ProgressRepository);
  service.registerCourse(course);
  const result = await service.migrateSnapshot(input);
  expect(result.courses['python-basics']!.lessons[lessonId]).toEqual(lesson);
  expect(result.courses['python-basics']!.lessons['python-basics-ch01-l05-values']).toBeUndefined();
  expect(
    result.courses['python-basics']!.lessons['python-basics-ch01-l05-iterate'],
  ).toBeUndefined();
  expect(result.courses['python-basics']!.currentComplete).toBe(false);
  const original = input.drafts[`python-basics:${lessonId}-e01`]!;
  expect(result.drafts[`python-basics:${lessonId}-e01`]).toEqual({
    ...original,
    contentRevision: course.revision,
    lastPassingSnapshots: {
      [`${lessonId}-e01`]: {
        ...original.lastPassingSnapshots[`${lessonId}-e01`],
        contentRevision: course.revision,
      },
    },
  });
  expect(original.contentRevision).toBe('2026-10-28.2');
  expect(result.quarantined).toEqual([]);
});
