import { describe, expect, it } from 'vitest';
import { migrateRepositorySnapshot } from '../../../src/adapters/persistence/indexeddb/migrateProgress';
import { schemaV1Progress } from '../../fixtures/progress/schema-v1';

const now = '2026-07-10T00:00:00.000Z';

describe('progress record migration', () => {
  it('schema v1のcursor・pass snapshot・初回完了日時をschema v2へ移行する', () => {
    const before = structuredClone(schemaV1Progress);
    const result = migrateRepositorySnapshot(schemaV1Progress, now);
    const draft = result.drafts['fixture:workspace-1'];

    expect(result.schemaVersion).toBe(2);
    expect(draft?.cursors['index.html']).toEqual({ anchor: 4, head: 4 });
    expect(draft?.editRevision).toBe(0);
    expect(draft?.lastPassingSnapshots['ex-1']).toEqual({
      editRevision: 0,
      contentRevision: 'rev-1',
      files: { 'index.html': '<main />' },
      evaluatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(result.courses.fixture?.firstCompletedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(result.courses.fixture?.lessons['lesson-1']?.firstCompletedAt).toBe(
      '2026-07-01T00:00:00.000Z',
    );
    expect(result.quarantined).toEqual([]);
    expect(schemaV1Progress).toEqual(before);
  });

  it('passでない旧validationから合格snapshotを推測しない', () => {
    const sourceDraft = schemaV1Progress.drafts['fixture:workspace-1'];
    const raw = {
      ...schemaV1Progress,
      drafts: {
        ...schemaV1Progress.drafts,
        'fixture:workspace-1': {
          ...sourceDraft,
          validationHistory: [
            { ...sourceDraft.validationHistory[0], status: 'incomplete' as const },
          ],
        },
      },
    };
    const result = migrateRepositorySnapshot(raw, now);

    expect(result.drafts['fixture:workspace-1']?.lastPassingSnapshots).toEqual({});
  });

  it('別Exerciseのpass証跡が混じる旧Draftを合格扱いせず隔離する', () => {
    const sourceDraft = schemaV1Progress.drafts['fixture:workspace-1'];
    const raw = {
      ...schemaV1Progress,
      drafts: {
        'fixture:workspace-1': {
          ...sourceDraft,
          validationHistory: [
            { ...sourceDraft.validationHistory[0], exerciseId: 'other-exercise' },
          ],
        },
      },
    };
    const result = migrateRepositorySnapshot(raw, now);

    expect(result.drafts).toEqual({});
    expect(result.quarantined[0]?.reason).toContain('ExerciseDraft');
  });

  it('nested fieldが破損したCourse・v1 Draft・v2 Draftをrecord単位で隔離する', () => {
    const v1 = structuredClone(schemaV1Progress) as unknown as Record<string, unknown>;
    const courses = v1.courses as Record<string, unknown>;
    const course = structuredClone(courses.fixture) as Record<string, unknown>;
    const lessons = course.lessons as Record<string, unknown>;
    lessons['lesson-1'] = { ...(lessons['lesson-1'] as object), currentComplete: 'yes' };
    courses.fixture = course;
    const drafts = v1.drafts as Record<string, unknown>;
    drafts['fixture:workspace-1'] = {
      ...(drafts['fixture:workspace-1'] as object),
      files: { 'index.html': '<main />', 'style.css': 42 },
    };

    const migratedV1 = migrateRepositorySnapshot(v1, now);
    expect(migratedV1.courses).toEqual({});
    expect(migratedV1.drafts).toEqual({});
    expect(migratedV1.quarantined.map(({ reason }) => reason)).toEqual([
      expect.stringContaining('CourseProgress fixture'),
      expect.stringContaining('ExerciseDraft fixture:workspace-1'),
    ]);

    const validV2 = migrateRepositorySnapshot(schemaV1Progress, now);
    const corruptV2 = structuredClone(validV2) as unknown as Record<string, unknown>;
    const v2Drafts = corruptV2.drafts as Record<string, unknown>;
    v2Drafts['fixture:workspace-1'] = {
      ...(v2Drafts['fixture:workspace-1'] as object),
      cursors: { 'index.html': { anchor: 'four', head: 4 } },
    };
    const migratedV2 = migrateRepositorySnapshot(corruptV2, now);
    expect(migratedV2.drafts).toEqual({});
    expect(migratedV2.quarantined.at(-1)?.reason).toContain('ExerciseDraft');
  });

  it('valid quarantineを保持し、破損quarantineは新しい隔離recordへ包む', () => {
    const v2 = migrateRepositorySnapshot(schemaV1Progress, now);
    const raw = {
      ...v2,
      quarantined: [
        { id: 'q-1', reason: '既存', quarantinedAt: now, raw: { broken: true } },
        { id: 42, reason: 'broken' },
      ],
    };
    const result = migrateRepositorySnapshot(raw, now);

    expect(result.quarantined[0]).toMatchObject({ id: 'q-1', reason: '既存' });
    expect(result.quarantined[1]?.reason).toContain('QuarantinedProgress');
    expect(result.quarantined[1]?.raw).toEqual({ id: 42, reason: 'broken' });

    const missingRaw = migrateRepositorySnapshot(
      { ...v2, quarantined: [{ id: 'q-2', reason: 'missing', quarantinedAt: now }] },
      now,
    );
    expect(missingRaw.quarantined[0]?.reason).toContain('QuarantinedProgress');
    expect(missingRaw.quarantined[0]?.raw).toEqual({
      id: 'q-2',
      reason: 'missing',
      quarantinedAt: now,
    });
  });

  it.each([null, [], 'broken'])('非object rootを拒否する: %j', (raw) => {
    expect(() => migrateRepositorySnapshot(raw, now)).toThrow(
      '進捗データのルートがオブジェクトではありません',
    );
  });

  it('future schemaと非object collectionを明示的に拒否する', () => {
    expect(() => migrateRepositorySnapshot({ schemaVersion: 99 }, now)).toThrow(
      '未対応の進捗schemaVersionです: 99',
    );
    expect(() =>
      migrateRepositorySnapshot({ schemaVersion: 2, courses: [], drafts: {} }, now),
    ).toThrow('coursesがオブジェクトではありません');
  });
});
