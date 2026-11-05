// @vitest-environment node
import { expect, it } from 'vitest';
import { compileCourse } from '../../scripts/content/compileCourse';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type { ProgressRepository, RepositorySnapshot } from '../../src/core/persistence/contracts';

it('別目標になったPython旧達成と下書きを隔離し、無関係な内容は保持する', async () => {
  const { runtime: course } = await compileCourse('content/python-basics');
  const ids = [
    'python-basics-ch01-l01',
    'python-basics-ch01-l07',
    'python-basics-ch01-l08',
    'python-basics-ch01-l09',
  ] as const;
  const revision = '2026-10-12.1';
  const updatedAt = '2026-10-12T00:00:00.000Z';
  const input: RepositorySnapshot = {
    schemaVersion: 2,
    courses: {
      'python-basics': {
        courseId: 'python-basics',
        contentRevision: revision,
        currentComplete: true,
        updatedAt,
        lessons: Object.fromEntries(
          ids.map((lessonId) => [
            lessonId,
            {
              lessonId,
              viewedSlideIds: [`${lessonId}-s01`],
              passedExerciseIds: [`${lessonId}-e01`],
              passedChecklistItemIds: [],
              passedRuleIds: [`${lessonId}-e01-r01`],
              passedViewportIds: ['desktop-1280'],
              currentComplete: true,
            },
          ]),
        ),
      },
    },
    drafts: Object.fromEntries(
      ids.map((lessonId) => [
        `python-basics:${lessonId}-e01`,
        {
          courseId: 'python-basics',
          lessonId,
          exerciseId: `${lessonId}-e01`,
          workspaceId: `${lessonId}-e01`,
          contentRevision: revision,
          editRevision: 4,
          files: { 'main.py': `# preserved ${lessonId}\n` },
          selectedFile: 'main.py',
          cursors: { 'main.py': { anchor: 3, head: 3 } },
          validationHistory: [],
          revealedHintIds: [],
          lastPassingSnapshots: {
            [`${lessonId}-e01`]: {
              editRevision: 4,
              contentRevision: revision,
              files: { 'main.py': '# original passing source\n' },
              evaluatedAt: updatedAt,
            },
          },
          updatedAt,
        },
      ]),
    ),
    quarantined: [],
  };
  const original = structuredClone(input);
  const service = new ContentProgressMigrationService({} as ProgressRepository, {
    now: () => '2026-11-03T00:00:00.000Z',
    id: () => 'representative-test',
  });
  service.registerCourse(course);
  const result = await service.migrateSnapshot(input);
  for (const lessonId of ids.slice(1)) {
    expect(result.courses['python-basics']?.lessons[lessonId]).toBeUndefined();
    expect(result.drafts[`python-basics:${lessonId}-e01`]).toBeUndefined();
    const draft = input.drafts[`python-basics:${lessonId}-e01`]!;
    // 空の既存edgeを先に経るため、隔離時のrevisionだけは中間版になる。
    expect(result.quarantined.map(({ raw }) => raw)).toContainEqual({
      ...draft,
      contentRevision: '2026-10-27.1',
      lastPassingSnapshots: Object.fromEntries(
        Object.entries(draft.lastPassingSnapshots).map(([id, snapshot]) => [
          id,
          { ...snapshot, contentRevision: '2026-10-27.1' },
        ]),
      ),
    });
  }
  expect(result.courses['python-basics']?.lessons[ids[0]]).toEqual(
    input.courses['python-basics']?.lessons[ids[0]],
  );
  expect(result.drafts[`python-basics:${ids[0]}-e01`]?.files).toEqual(
    input.drafts[`python-basics:${ids[0]}-e01`]?.files,
  );
  expect(result.courses['python-basics']?.currentComplete).toBe(false);
  expect(input).toEqual(original);
  expect(await service.migrateSnapshot(result)).toEqual(result);
});
