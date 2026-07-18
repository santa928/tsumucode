import { describe, expect, it, vi, type Mock } from 'vitest';
import type { CourseManifest } from '../../../src/core/content/types';
import { canonicalJson, sha256 } from '../../../src/core/persistence/canonicalJson';
import type {
  ProgressBundle,
  ProgressRepository,
  RepositorySnapshot,
} from '../../../src/core/persistence/contracts';
import { ContentProgressMigrationService } from '../../../src/core/persistence/contentProgressMigration';
import { TransferService } from '../../../src/core/persistence/transferService';
import { fixtureCourse } from '../../fixtures/course';
import {
  createAllCoursesSnapshot,
  createExerciseDraft,
} from '../../fixtures/progress/all-courses-bundle';
import { FUTURE_PROGRESS_SCHEMA_VERSION } from '../../fixtures/progress/future-version';
import { schemaV1Progress } from '../../fixtures/progress/schema-v1';

const empty: RepositorySnapshot = { schemaVersion: 2, courses: {}, drafts: {}, quarantined: [] };
const now = '2026-07-15T00:00:00.000Z';

const transferMigratingCourse: CourseManifest = {
  ...fixtureCourse,
  revision: 'rev-2',
  progressMigrations: [
    {
      fromRevision: 'rev-1',
      toRevision: 'rev-2',
      steps: [
        {
          action: 'map-to',
          entity: 'lesson',
          fromId: 'lesson-old',
          toId: 'lesson-first-heading',
        },
        {
          action: 'map-to',
          entity: 'exercise',
          fromId: 'exercise-old',
          toId: 'exercise-first-heading',
        },
        {
          action: 'map-to',
          entity: 'workspace',
          fromId: 'workspace-old',
          toId: 'workspace-first-heading',
        },
      ],
    },
  ],
};

const schemaV1Course: CourseManifest = {
  ...fixtureCourse,
  id: 'fixture',
  revision: 'rev-1',
};

const sandboxCourse: CourseManifest = {
  ...fixtureCourse,
  id: 'sandbox',
  revision: 'rev-1',
};

const transferResettingCourse: CourseManifest = {
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

const transferBrokenChainCourse: CourseManifest = {
  ...fixtureCourse,
  revision: 'rev-3',
  progressMigrations: [
    {
      fromRevision: 'rev-1',
      toRevision: 'rev-2',
      steps: [],
    },
  ],
};

/** 完全Repository contractのうちTransferが使う操作を観測可能なmockにする。 */
function repositoryFor(snapshot: RepositorySnapshot): ProgressRepository {
  return {
    snapshot: vi.fn().mockResolvedValue(snapshot),
    createBackup: vi.fn().mockResolvedValue({ id: 'backup-1', snapshot }),
    replaceSnapshot: vi.fn().mockResolvedValue(undefined),
    replaceSnapshotWithBackup: vi.fn().mockResolvedValue({
      id: 'backup-1',
      reason: 'before-import',
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

/** export済みJSONのunsigned部を変更し、正しいhashを再計算する。 */
async function resign(
  raw: string,
  mutate: (unsigned: Record<string, unknown>) => void,
): Promise<string> {
  const parsed = JSON.parse(raw) as Record<string, unknown> & {
    integrity: ProgressBundle['integrity'];
  };
  const unsigned = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key !== 'integrity'),
  );
  mutate(unsigned);
  return JSON.stringify({
    ...unsigned,
    integrity: { algorithm: 'SHA-256', digest: await sha256(canonicalJson(unsigned)) },
  });
}

/** unsigned bundleへcanonical hashを付け、Import可能なJSONへ変換する。 */
async function sign(unsigned: Record<string, unknown>): Promise<string> {
  return JSON.stringify({
    ...unsigned,
    integrity: { algorithm: 'SHA-256', digest: await sha256(canonicalJson(unsigned)) },
  });
}

describe('canonical JSON', () => {
  it('object keyをcode point順で再帰sortし、array順序と入力を維持する', () => {
    const input = { z: 1, a: { y: 2, b: 3 }, list: [{ z: 1, a: 2 }, 0] };
    const before = JSON.stringify(input);
    expect(canonicalJson(input)).toBe('{"a":{"b":3,"y":2},"list":[{"a":2,"z":1},0],"z":1}');
    expect(JSON.stringify(input)).toBe(before);
    expect(canonicalJson({ '\u{10000}': 1, '\ue000': 2 })).toBe('{"":2,"𐀀":1}');
  });

  it.each([
    ['undefined', { value: undefined }],
    ['function', { value: () => undefined }],
    ['symbol', { value: Symbol('x') }],
    ['bigint', { value: 1n }],
    ['NaN', { value: Number.NaN }],
    ['Infinity', { value: Number.POSITIVE_INFINITY }],
    ['nonplain', new Date('2026-07-15T00:00:00.000Z')],
  ])('%sをhash対象として拒否する', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow('canonical JSON');
  });

  it('循環参照を拒否し、SHA-256の既知vectorをhexで返す', async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow('循環');
    expect(await sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('疎なarrayと追加propertyを持つarrayを拒否する', () => {
    const sparse = new Array<unknown>(1);
    const extended: unknown[] & { extra?: string } = [1];
    extended.extra = 'ignored by JSON.stringify';
    expect(() => canonicalJson(sparse)).toThrow('疎なarray');
    expect(() => canonicalJson(extended)).toThrow('追加property');
  });
});

describe('all-course transfer', () => {
  it('全Courseをhash付きでexportし、同一snapshotの差分を返さない', async () => {
    const snapshot = createAllCoursesSnapshot();
    const repository = repositoryFor(snapshot);
    const migrations = new ContentProgressMigrationService(repository);
    migrations.registerCourse(fixtureCourse);
    migrations.registerCourse(sandboxCourse);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-1',
    });

    const raw = await service.exportAll();
    const parsed = JSON.parse(raw) as ProgressBundle;
    const { integrity, ...unsigned } = parsed;
    expect(integrity).toEqual({
      algorithm: 'SHA-256',
      digest: await sha256(canonicalJson(unsigned)),
    });
    expect((await service.prepareImport(raw)).differences).toEqual([]);
  });

  it('緊急overlayを持つRepositoryのExportは正本snapshotではなく救済snapshotを含める', async () => {
    const durable = createAllCoursesSnapshot();
    const rescuedDraft = {
      ...createExerciseDraft('html-css', fixtureCourse.revision),
      editRevision: 42,
    };
    const emergency = {
      ...durable,
      drafts: {
        ...durable.drafts,
        'html-css:workspace-first-heading': rescuedDraft,
      },
    };
    const repository = Object.assign(repositoryFor(durable), {
      emergencySnapshot: vi.fn(async () => emergency),
    });
    const migrations = new ContentProgressMigrationService(repository);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-emergency',
    });

    const parsed = JSON.parse(await service.exportAll()) as ProgressBundle;

    expect(parsed.drafts['html-css:workspace-first-heading']).toMatchObject({ editRevision: 42 });
    expect(repository.emergencySnapshot).toHaveBeenCalledOnce();
  });

  it('CourseProgressが同じでもDraftだけの変更をreplace差分として返す', async () => {
    const current = createAllCoursesSnapshot();
    const repository = repositoryFor(current);
    const migrations = new ContentProgressMigrationService(repository);
    migrations.registerCourse(fixtureCourse);
    migrations.registerCourse(sandboxCourse);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-1',
    });
    const raw = await service.exportAll();
    const changed = await resign(raw, (unsigned) => {
      const drafts = unsigned.drafts as Record<string, unknown>;
      drafts['html-css:workspace-first-heading'] = {
        ...createExerciseDraft('html-css', fixtureCourse.revision),
        editRevision: 9,
      };
    });

    await expect(service.prepareImport(changed)).resolves.toMatchObject({
      differences: [{ courseId: 'html-css', kind: 'replace' }],
    });
  });

  it('旧contentRevisionをpreview前に現行IDへ移行し、現行snapshotだけを適用する', async () => {
    const repository = repositoryFor(empty);
    let replacement: RepositorySnapshot | undefined;
    mockMethod(repository, 'replaceSnapshotWithBackup').mockImplementation(
      (snapshot: RepositorySnapshot) => {
        replacement = snapshot;
        return Promise.resolve({ id: 'backup-1', snapshot: empty });
      },
    );
    const migrations = new ContentProgressMigrationService(repository);
    migrations.registerCourse(transferMigratingCourse);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-migrated',
    });
    const raw = await service.exportAll();
    const oldDraft = {
      ...createExerciseDraft('html-css', 'rev-1', 'workspace-old'),
      lessonId: 'lesson-old',
      exerciseId: 'exercise-old',
    };
    const oldBundle = await resign(raw, (unsigned) => {
      unsigned.courses = {
        'html-css': {
          courseId: 'html-css',
          contentRevision: 'rev-1',
          lessons: {},
          currentComplete: false,
          updatedAt: now,
        },
      };
      unsigned.drafts = { 'html-css:workspace-old': oldDraft };
    });

    await expect(service.prepareImport(oldBundle)).resolves.toMatchObject({
      differences: [{ courseId: 'html-css', kind: 'add' }],
    });
    await service.applyImport('preview-migrated');
    expect(replacement?.courses['html-css']?.contentRevision).toBe('rev-2');
    expect(replacement?.drafts['html-css:workspace-first-heading']).toMatchObject({
      lessonId: 'lesson-first-heading',
      exerciseId: 'exercise-first-heading',
      workspaceId: 'workspace-first-heading',
      contentRevision: 'rev-2',
    });
  });

  it('quarantined keyを持たないschema v1 bundleをstorage schema v2へ移行する', async () => {
    const repository = repositoryFor(empty);
    let replacement: RepositorySnapshot | undefined;
    mockMethod(repository, 'replaceSnapshotWithBackup').mockImplementation(
      (snapshot: RepositorySnapshot) => {
        replacement = snapshot;
        return Promise.resolve({ id: 'backup-1', snapshot: empty });
      },
    );
    const migrations = new ContentProgressMigrationService(repository);
    migrations.registerCourse(schemaV1Course);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-schema-v1',
    });
    const raw = await sign({
      ...schemaV1Progress,
      appVersion: '0.9.0',
      exportedAt: '2026-07-01T00:00:00.000Z',
    });

    await expect(service.prepareImport(raw)).resolves.toMatchObject({
      differences: [{ courseId: 'fixture', kind: 'add' }],
    });
    await service.applyImport('preview-schema-v1');
    expect(replacement?.schemaVersion).toBe(2);
    expect(replacement?.drafts['fixture:workspace-1']).toMatchObject({
      editRevision: 0,
      cursors: { 'index.html': { anchor: 4, head: 4 } },
    });
  });

  it('intentionally-resetの対象と理由だけをpreviewし、隔離rawは露出しない', async () => {
    const repository = repositoryFor(empty);
    const migrations = new ContentProgressMigrationService(repository, {
      now: () => now,
      id: () => 'reset-notice',
    });
    migrations.registerCourse(transferResettingCourse);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-reset',
    });
    const oldDraft = {
      ...createExerciseDraft('html-css', 'rev-1', 'workspace-old'),
      files: { 'index.html': '<h1>UIに出してはいけない内部raw</h1>' },
    };
    const raw = await resign(await service.exportAll(), (unsigned) => {
      unsigned.courses = {
        'html-css': {
          courseId: 'html-css',
          contentRevision: 'rev-1',
          lessons: {},
          currentComplete: false,
          updatedAt: now,
        },
      };
      unsigned.drafts = { 'html-css:workspace-old': oldDraft };
    });

    const preview = await service.prepareImport(raw);

    expect(preview.resetNotices).toEqual([
      {
        id: 'reset-notice-1',
        courseId: 'html-css',
        entity: 'workspace',
        sourceId: 'workspace-old',
        reason: '教材移行でworkspace:workspace-oldをresetしました: 編集環境を廃止したため',
      },
    ]);
    expect(JSON.stringify(preview)).not.toContain('UIに出してはいけない内部raw');
  });

  it.each([
    {
      label: '未登録Course',
      course: undefined,
      revision: fixtureCourse.revision,
      expected: '未登録Course: html-css',
    },
    {
      label: 'future revision',
      course: transferMigratingCourse,
      revision: 'rev-99',
      expected: 'future',
    },
    {
      label: 'migration chain欠落',
      course: transferBrokenChainCourse,
      revision: 'rev-1',
      expected: 'chainが欠落',
    },
  ])('$labelはpreview・backup・置換前に拒否する', async ({ course, revision, expected }) => {
    const repository = repositoryFor(empty);
    const migrations = new ContentProgressMigrationService(repository);
    if (course !== undefined) migrations.registerCourse(course);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
    });
    const raw = await resign(await service.exportAll(), (unsigned) => {
      unsigned.courses = {
        'html-css': {
          courseId: 'html-css',
          contentRevision: revision,
          lessons: {},
          currentComplete: false,
          updatedAt: now,
        },
      };
    });

    await expect(service.prepareImport(raw)).rejects.toThrow(expected);
    expect(mockMethod(repository, 'replaceSnapshotWithBackup')).not.toHaveBeenCalled();
  });

  it('壊れたhash・metadata・future schemaはbackupも置換もせず拒否する', async () => {
    const repository = repositoryFor(empty);
    const migrations = new ContentProgressMigrationService(repository);
    migrations.registerCourse(fixtureCourse);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
    });
    const raw = await service.exportAll();
    const invalidHash = raw.replace(/"digest":\s*"[a-f0-9]+"/, '"digest":"00"');
    const invalidMetadata = await resign(raw, (unsigned) => {
      unsigned.appVersion = 42;
    });
    const future = await resign(raw, (unsigned) => {
      unsigned.schemaVersion = FUTURE_PROGRESS_SCHEMA_VERSION;
    });

    await expect(service.prepareImport(invalidHash)).rejects.toThrow('hash');
    await expect(service.prepareImport(invalidMetadata)).rejects.toThrow('metadata');
    await expect(service.prepareImport(future)).rejects.toThrow('未対応の進捗schemaVersion');
    expect(mockMethod(repository, 'replaceSnapshotWithBackup')).not.toHaveBeenCalled();
  });

  it('applyをsingle-flight・成功後single-useにし、同時二重適用を拒否する', async () => {
    let releaseReplace: (() => void) | undefined;
    const repository = repositoryFor(empty);
    mockMethod(repository, 'replaceSnapshotWithBackup').mockImplementation(
      () =>
        new Promise<{ id: string; snapshot: RepositorySnapshot }>((resolve) => {
          releaseReplace = () => {
            resolve({ id: 'backup-1', snapshot: empty });
          };
        }),
    );
    const migrations = new ContentProgressMigrationService(repository);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-1',
    });
    const preview = await service.prepareImport(await service.exportAll());

    const first = service.applyImport(preview.id);
    await expect(service.applyImport(preview.id)).rejects.toThrow('適用中');
    releaseReplace?.();
    await first;
    await expect(service.applyImport(preview.id)).rejects.toThrow('有効期限');
    expect(mockMethod(repository, 'replaceSnapshotWithBackup')).toHaveBeenCalledTimes(1);
  });

  it('atomic置換失敗時は元Errorを返し、永続snapshotを変更せずmanual restoreもしない', async () => {
    const repository = repositoryFor(empty);
    const replaceError = new Error('quota');
    mockMethod(repository, 'replaceSnapshotWithBackup').mockRejectedValue(replaceError);
    const migrations = new ContentProgressMigrationService(repository);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-1',
    });
    const preview = await service.prepareImport(await service.exportAll());

    await expect(service.applyImport(preview.id)).rejects.toBe(replaceError);
    await expect(repository.snapshot()).resolves.toEqual(empty);
    expect(mockMethod(repository, 'restoreBackup')).not.toHaveBeenCalled();
  });

  it('atomic置換失敗後も同じpreviewを再試行できる', async () => {
    const repository = repositoryFor(empty);
    const replaceError = new Error('quota');
    mockMethod(repository, 'replaceSnapshotWithBackup')
      .mockRejectedValueOnce(replaceError)
      .mockResolvedValueOnce({ id: 'backup-2', snapshot: empty });
    const migrations = new ContentProgressMigrationService(repository);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => 'preview-retry',
    });
    const preview = await service.prepareImport(await service.exportAll());

    await expect(service.applyImport(preview.id)).rejects.toBe(replaceError);
    await expect(service.applyImport(preview.id)).resolves.toBeUndefined();
    expect(mockMethod(repository, 'replaceSnapshotWithBackup')).toHaveBeenCalledTimes(2);
    expect(mockMethod(repository, 'restoreBackup')).not.toHaveBeenCalled();
  });

  it('新しいpreview・明示cancel・apply成功でprepared snapshotを再利用不可にする', async () => {
    let sequence = 0;
    const repository = repositoryFor(empty);
    const migrations = new ContentProgressMigrationService(repository);
    const service = new TransferService(repository, migrations, {
      appVersion: '1.0.0',
      now: () => now,
      id: () => `preview-${String(++sequence)}`,
    });
    const raw = await service.exportAll();

    const replaced = await service.prepareImport(raw);
    const current = await service.prepareImport(raw);
    await expect(service.applyImport(replaced.id)).rejects.toThrow('有効期限');

    expect(() => service.discardImport(current.id)).not.toThrow();
    await expect(service.applyImport(current.id)).rejects.toThrow('有効期限');

    const applied = await service.prepareImport(raw);
    await expect(service.applyImport(applied.id)).resolves.toBeUndefined();
    expect(() => service.discardImport(applied.id)).not.toThrow();
    await expect(service.applyImport(applied.id)).rejects.toThrow('有効期限');
  });
});
