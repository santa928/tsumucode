import { describe, expect, it, vi, type Mock } from 'vitest';
import type { CourseManifest } from '../../../src/core/content/types';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import type {
  ExerciseDraft,
  ProgressRepository,
  RepositorySnapshot,
} from '../../../src/core/persistence/contracts';
import { ContentProgressMigrationService } from '../../../src/core/persistence/contentProgressMigration';
import { fixtureCourse } from '../../fixtures/course';

const now = '2026-07-15T00:00:00.000Z';

const migratingCourse: CourseManifest = {
  ...fixtureCourse,
  revision: 'rev-3',
  progressMigrations: [
    {
      fromRevision: 'rev-1',
      toRevision: 'rev-2',
      steps: [
        { action: 'map-to', entity: 'chapter', fromId: 'chapter-old', toId: 'chapter-mid' },
        { action: 'map-to', entity: 'lesson', fromId: 'lesson-old', toId: 'lesson-mid' },
        { action: 'map-to', entity: 'slide', fromId: 'slide-old', toId: 'slide-mid' },
        {
          action: 'intentionally-reset',
          entity: 'slide',
          id: 'slide-reset',
          reason: '説明を廃止したため',
        },
        {
          action: 'map-to',
          entity: 'exercise',
          fromId: 'exercise-old',
          toId: 'exercise-mid',
        },
        {
          action: 'intentionally-reset',
          entity: 'exercise',
          id: 'exercise-reset',
          reason: '問題を廃止したため',
        },
        { action: 'map-to', entity: 'rule', fromId: 'rule-old', toId: 'rule-mid' },
        {
          action: 'intentionally-reset',
          entity: 'rule',
          id: 'rule-reset',
          reason: '判定を廃止したため',
        },
        { action: 'map-to', entity: 'hint', fromId: 'hint-old', toId: 'hint-mid' },
        {
          action: 'intentionally-reset',
          entity: 'hint',
          id: 'hint-reset',
          reason: 'ヒントを廃止したため',
        },
        {
          action: 'map-to',
          entity: 'checklist',
          fromId: 'checklist-old',
          toId: 'checklist-mid',
        },
        {
          action: 'map-to',
          entity: 'workspace',
          fromId: 'workspace-old',
          toId: 'workspace-mid',
        },
        { action: 'preserve', entity: 'slide', id: 'slide-stable' },
      ],
    },
    {
      fromRevision: 'rev-2',
      toRevision: 'rev-3',
      steps: [
        { action: 'map-to', entity: 'chapter', fromId: 'chapter-mid', toId: 'ch00-web-map' },
        {
          action: 'map-to',
          entity: 'lesson',
          fromId: 'lesson-mid',
          toId: 'lesson-first-heading',
        },
        { action: 'map-to', entity: 'slide', fromId: 'slide-mid', toId: 'slide-html-role' },
        {
          action: 'map-to',
          entity: 'exercise',
          fromId: 'exercise-mid',
          toId: 'exercise-first-heading',
        },
        { action: 'map-to', entity: 'rule', fromId: 'rule-mid', toId: 'rule-h1-exists' },
        { action: 'map-to', entity: 'hint', fromId: 'hint-mid', toId: 'hint-h1-1' },
        {
          action: 'map-to',
          entity: 'checklist',
          fromId: 'checklist-mid',
          toId: 'checklist-current',
        },
        {
          action: 'map-to',
          entity: 'workspace',
          fromId: 'workspace-mid',
          toId: 'workspace-first-heading',
        },
        { action: 'preserve', entity: 'slide', id: 'slide-stable' },
      ],
    },
  ],
};

const brokenChainCourse: CourseManifest = {
  ...migratingCourse,
  progressMigrations: [migratingCourse.progressMigrations[0]!],
};

const resettingWorkspaceCourse: CourseManifest = {
  ...fixtureCourse,
  revision: 'rev-2',
  progressMigrations: [
    {
      fromRevision: 'rev-1',
      toRevision: 'rev-2',
      steps: [
        {
          action: 'intentionally-reset',
          entity: 'workspace',
          id: 'workspace-old',
          reason: '編集環境を廃止したため',
        },
      ],
    },
  ],
};

const secondResettingCourse: CourseManifest = {
  ...resettingWorkspaceCourse,
  id: 'css-2',
};

/** 全参照fieldを含むrev-1 Draftを生成する。 */
function oldDraft(workspaceId = 'workspace-old'): ExerciseDraft {
  return {
    courseId: 'html-css',
    lessonId: 'lesson-old',
    exerciseId: 'exercise-old',
    workspaceId,
    contentRevision: 'rev-1',
    editRevision: 3,
    files: { 'index.html': '<h1>積む</h1>' },
    selectedFile: 'index.html',
    cursors: { 'index.html': { anchor: 4, head: 4 } },
    validationHistory: [
      {
        exerciseId: 'exercise-old',
        executionRevision: 3,
        status: 'pass',
        checks: [
          {
            ruleId: 'rule-old',
            requirementId: 'req-1',
            label: '見出し',
            required: true,
            passed: true,
            requirementPassed: true,
            message: '合格',
            expected: 'h1',
            actual: 'h1',
            nextAction: '次へ',
            hintId: 'hint-old',
            relatedSlideId: 'slide-old',
          },
          {
            ruleId: 'rule-reset',
            requirementId: 'req-reset',
            label: '旧判定',
            required: false,
            passed: true,
            requirementPassed: true,
            message: '旧判定',
            expected: '旧',
            actual: '旧',
            nextAction: 'なし',
            hintId: 'hint-reset',
            relatedSlideId: 'slide-reset',
          },
        ],
        passedRequirementIds: ['req-1'],
        diagnostics: [],
        evaluatedAt: '2026-07-10T00:00:00.000Z',
      },
    ],
    revealedHintIds: ['hint-old', 'hint-reset'],
    reviewSlideId: 'slide-old',
    reviewScrollOffset: 120,
    lastPassingSnapshots: {
      'exercise-old': {
        editRevision: 3,
        contentRevision: 'rev-1',
        files: { 'index.html': '<h1>積む</h1>' },
        evaluatedAt: '2026-07-10T00:00:00.000Z',
      },
    },
    updatedAt: '2026-07-10T00:00:00.000Z',
  };
}

/** map/reset対象を網羅したrev-1 snapshotを生成する。 */
function oldSnapshot(): RepositorySnapshot {
  return {
    schemaVersion: 2,
    courses: {
      'html-css': {
        courseId: 'html-css',
        contentRevision: 'rev-1',
        lessons: {
          'lesson-old': {
            lessonId: 'lesson-old',
            viewedSlideIds: ['slide-old', 'slide-stable', 'slide-reset'],
            currentSlideId: 'slide-old',
            passedExerciseIds: ['exercise-old', 'exercise-reset'],
            passedChecklistItemIds: ['checklist-old'],
            passedRuleIds: ['rule-old', 'rule-reset'],
            passedViewportIds: ['desktop'],
            currentComplete: true,
            firstCompletedAt: '2026-07-09T00:00:00.000Z',
          },
        },
        currentLessonId: 'lesson-old',
        currentChapterId: 'chapter-old',
        currentComplete: true,
        firstCompletedAt: '2026-07-09T00:00:00.000Z',
        updatedAt: '2026-07-10T00:00:00.000Z',
      },
    },
    drafts: { 'html-css:workspace-old': oldDraft() },
    quarantined: [],
  };
}

/** Repository契約の必要操作だけをmockする。 */
function repositoryFor(snapshot: RepositorySnapshot): ProgressRepository {
  return {
    snapshot: vi.fn().mockResolvedValue(snapshot),
    createBackup: vi.fn().mockResolvedValue({ id: 'backup-1', snapshot }),
    replaceSnapshot: vi.fn().mockResolvedValue(undefined),
    replaceSnapshotWithBackup: vi.fn().mockResolvedValue({
      id: 'backup-1',
      reason: 'recovery',
      createdAt: now,
      snapshot,
    }),
    restoreBackup: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProgressRepository;
}

/** interface methodをthis非依存のVitest mockとして安全に参照する。 */
function mockMethod(
  repository: ProgressRepository,
  key: 'createBackup' | 'replaceSnapshot' | 'replaceSnapshotWithBackup' | 'restoreBackup',
): Mock {
  return (repository as unknown as Readonly<Record<string, Mock>>)[key]!;
}

describe('ContentProgressMigrationService', () => {
  it('2 revisionを連続適用し、全参照を移してreset断片を隔離する', async () => {
    const service = new ContentProgressMigrationService(repositoryFor(oldSnapshot()), {
      now: () => now,
      id: () => 'quarantine-id',
    });
    service.registerCourse(migratingCourse);

    const result = await service.migrateSnapshot(oldSnapshot());
    const course = result.courses['html-css'];
    const lesson = course?.lessons['lesson-first-heading'];
    const draft = result.drafts['html-css:workspace-first-heading'];

    expect(course).toMatchObject({
      contentRevision: 'rev-3',
      currentLessonId: 'lesson-first-heading',
      currentChapterId: 'ch00-web-map',
      firstCompletedAt: '2026-07-09T00:00:00.000Z',
    });
    expect(lesson).toMatchObject({
      lessonId: 'lesson-first-heading',
      viewedSlideIds: ['slide-html-role', 'slide-stable'],
      currentSlideId: 'slide-html-role',
      passedExerciseIds: ['exercise-first-heading'],
      passedChecklistItemIds: ['checklist-current'],
      passedRuleIds: ['rule-h1-exists'],
      firstCompletedAt: '2026-07-09T00:00:00.000Z',
    });
    expect(draft).toMatchObject({
      lessonId: 'lesson-first-heading',
      exerciseId: 'exercise-first-heading',
      workspaceId: 'workspace-first-heading',
      contentRevision: 'rev-3',
      revealedHintIds: ['hint-h1-1'],
      reviewSlideId: 'slide-html-role',
    });
    expect(draft?.validationHistory[0]).toMatchObject({
      exerciseId: 'exercise-first-heading',
      checks: [
        {
          ruleId: 'rule-h1-exists',
          hintId: 'hint-h1-1',
          relatedSlideId: 'slide-html-role',
        },
      ],
    });
    expect(draft?.lastPassingSnapshots['exercise-first-heading']).toMatchObject({
      contentRevision: 'rev-3',
    });
    expect(result.quarantined).toHaveLength(7);
    expect(result.quarantined.map(({ reason }) => reason).join('\n')).toContain('廃止したため');
  });

  it.each([
    {
      label: 'Lesson key',
      mutate: (snapshot: RepositorySnapshot): RepositorySnapshot => {
        const course = snapshot.courses['html-css']!;
        const oldLesson = course.lessons['lesson-old']!;
        return {
          ...snapshot,
          courses: {
            'html-css': {
              ...course,
              lessons: {
                ...course.lessons,
                'lesson-mid': { ...oldLesson, lessonId: 'lesson-mid' },
              },
            },
          },
        };
      },
    },
    {
      label: 'evidence',
      mutate: (snapshot: RepositorySnapshot): RepositorySnapshot => {
        const course = snapshot.courses['html-css']!;
        const lesson = course.lessons['lesson-old']!;
        return {
          ...snapshot,
          courses: {
            'html-css': {
              ...course,
              lessons: {
                'lesson-old': {
                  ...lesson,
                  passedExerciseIds: ['exercise-old', 'exercise-mid'],
                },
              },
            },
          },
        };
      },
    },
    {
      label: 'Draft key',
      mutate: (snapshot: RepositorySnapshot): RepositorySnapshot => {
        return {
          ...snapshot,
          drafts: {
            ...snapshot.drafts,
            'html-css:workspace-mid': oldDraft('workspace-mid'),
          },
        };
      },
    },
    {
      label: 'Validation check evidence',
      mutate: (snapshot: RepositorySnapshot): RepositorySnapshot => {
        const draft = snapshot.drafts['html-css:workspace-old']!;
        const validation = draft.validationHistory[0]!;
        const check = validation.checks[0]!;
        return {
          ...snapshot,
          drafts: {
            'html-css:workspace-old': {
              ...draft,
              validationHistory: [
                {
                  ...validation,
                  checks: [check, { ...check, ruleId: 'rule-mid', requirementId: 'req-mid' }],
                },
              ],
            },
          },
        };
      },
    },
  ])('$labelのmap先衝突では入力を変更せず失敗する', async ({ mutate }) => {
    const input = mutate(oldSnapshot());
    const before = canonicalJson(input);
    const service = new ContentProgressMigrationService(repositoryFor(input), {
      now: () => now,
    });
    service.registerCourse(migratingCourse);

    await expect(service.migrateSnapshot(input)).rejects.toThrow('衝突');
    expect(canonicalJson(input)).toBe(before);
  });

  it.each([
    ['未知', 'unknown-revision', migratingCourse],
    ['future', 'rev-99', migratingCourse],
    ['chain欠落', 'rev-1', brokenChainCourse],
  ])('%s revisionでは入力を変更せず失敗する', async (_label, revision, courseManifest) => {
    const base = oldSnapshot();
    const input: RepositorySnapshot = {
      ...base,
      courses: {
        'html-css': { ...base.courses['html-css']!, contentRevision: revision },
      },
      drafts: {},
    };
    const before = canonicalJson(input);
    const service = new ContentProgressMigrationService(repositoryFor(input));
    service.registerCourse(courseManifest);

    await expect(service.migrateSnapshot(input)).rejects.toThrow(/revision|chain/);
    expect(canonicalJson(input)).toBe(before);
  });

  it('必須WorkspaceのresetではDraft全体を理由付きで隔離する', async () => {
    const input = oldSnapshot();
    const service = new ContentProgressMigrationService(repositoryFor(input), {
      now: () => now,
      id: () => 'reset-draft',
    });
    service.registerCourse(resettingWorkspaceCourse);

    const migrated = await service.migrateSnapshot(input);
    expect(migrated.drafts).toEqual({});
    expect(migrated.quarantined).toHaveLength(1);
    expect(migrated.quarantined[0]?.reason).toContain('workspace:workspace-old');
    expect(migrated.quarantined[0]?.raw).toBe(input.drafts['html-css:workspace-old']);
  });

  it('snapshotとUIに安全なreset noticeを同時に返す', async () => {
    const input = oldSnapshot();
    const service = new ContentProgressMigrationService(repositoryFor(input), {
      now: () => now,
      id: () => 'reset-notice',
    });
    service.registerCourse(resettingWorkspaceCourse);

    const result = await service.migrateSnapshotWithNotices(input);

    expect(result.snapshot.drafts).toEqual({});
    expect(result.notices).toEqual([
      {
        id: 'reset-notice-1',
        courseId: 'html-css',
        entity: 'workspace',
        sourceId: 'workspace-old',
        reason: '教材移行でworkspace:workspace-oldをresetしました: 編集環境を廃止したため',
      },
    ]);
    expect(result.notices[0]).not.toHaveProperty('raw');
  });

  it('Import用strict migrationはCourseまたはDraftが参照する未登録Courseを拒否する', async () => {
    const input = oldSnapshot();
    const repository = repositoryFor(input);
    const service = new ContentProgressMigrationService(repository);

    await expect(
      service.migrateSnapshotWithNotices(input, { requireRegisteredCourses: true }),
    ).rejects.toThrow('未登録Course: html-css');
    expect(mockMethod(repository, 'replaceSnapshotWithBackup')).not.toHaveBeenCalled();
  });

  it('通常load成功時はreset noticeを返し、backupと置換を原子的に実行する', async () => {
    const snapshot = oldSnapshot();
    const repository = repositoryFor(snapshot);
    const service = new ContentProgressMigrationService(repository, {
      now: () => now,
      id: () => 'notice',
    });

    const notices = await service.ensureStoredCourse(migratingCourse);
    expect(notices).toHaveLength(7);
    expect(notices[0]).toMatchObject({ courseId: 'html-css' });
    expect(mockMethod(repository, 'replaceSnapshotWithBackup')).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: 2 }),
      'recovery',
    );
  });

  it('複数Courseを同時移行してもreset noticeを発生元Courseへ帰属させる', async () => {
    const first = oldSnapshot();
    const secondCourse = {
      ...first.courses['html-css']!,
      courseId: 'css-2',
    };
    const secondDraft = { ...oldDraft(), courseId: 'css-2' };
    const snapshot: RepositorySnapshot = {
      ...first,
      courses: { ...first.courses, 'css-2': secondCourse },
      drafts: {
        ...first.drafts,
        'css-2:workspace-old': secondDraft,
      },
    };
    const repository = repositoryFor(snapshot);
    const service = new ContentProgressMigrationService(repository, {
      now: () => now,
      id: () => 'multi-course',
    });
    service.registerCourse(secondResettingCourse);

    const notices = await service.ensureStoredCourse(resettingWorkspaceCourse);
    expect(new Set(notices.map(({ courseId }) => courseId))).toEqual(
      new Set(['html-css', 'css-2']),
    );
  });

  it('通常loadのatomic置換失敗時は元snapshotを保ち、manual restoreしない', async () => {
    const snapshot = oldSnapshot();
    const repository = repositoryFor(snapshot);
    mockMethod(repository, 'replaceSnapshotWithBackup').mockRejectedValueOnce(new Error('quota'));
    const service = new ContentProgressMigrationService(repository, { now: () => now });

    await expect(service.ensureStoredCourse(migratingCourse)).rejects.toThrow('quota');
    expect(mockMethod(repository, 'replaceSnapshotWithBackup')).toHaveBeenCalledTimes(1);
    await expect(repository.snapshot()).resolves.toEqual(snapshot);
    expect(mockMethod(repository, 'restoreBackup')).not.toHaveBeenCalled();
  });
});
