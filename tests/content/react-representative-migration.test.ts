// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { migrateRepositorySnapshot } from '../../src/adapters/persistence/indexeddb/migrateProgress';
import { ContentProgressMigrationService } from '../../src/core/persistence/contentProgressMigration';
import type { ProgressRepository } from '../../src/core/persistence/contracts';
import { verifyHistoricalSyntheticProgressBundle } from '../fixtures/release/historicalProgressCourse';

it('旧React保存のSourceと履歴を隔離保持し、読書・compose・移動先へ達成を転記しない', async () => {
  const bundle: unknown = JSON.parse(
    await readFile('tests/fixtures/progress/react-previous-release-bundle.json', 'utf8'),
  );
  // 旧公開契約での完全性検査と、現教材への実移行を別々に通す。
  await verifyHistoricalSyntheticProgressBundle('react', bundle);
  const parsed = z.looseObject({ exportedAt: z.string(), integrity: z.unknown() }).parse(bundle);
  const { integrity, ...unsigned } = parsed;
  void integrity;
  const before = migrateRepositorySnapshot(unsigned, parsed.exportedAt);
  const original = structuredClone(before);
  const { runtime: course } = await loadAuthoringCourse('content/react');
  const service = new ContentProgressMigrationService({} as ProgressRepository);
  service.registerCourse(course);
  const after = await service.migrateSnapshot(before);
  expect(before).toEqual(original);
  expect(after.courses['react']?.contentRevision).toBe(course.revision);
  expect(after.courses['typescript']).toEqual(before.courses['typescript']);
  expect(after.courses['react']?.lessons['react-ch01-l01']).toEqual(
    before.courses['react']?.lessons['react-ch01-l01'],
  );
  for (const lesson of [
    'react-ch01-l06-compose',
    'react-ch01-l11-compose',
    'react-ch02-l01',
    'react-ch02-l02',
    'react-ch02-l03',
    'react-ch02-l04',
    'react-ch03-l01',
    'react-ch03-l02',
    'react-ch04-l01',
  ]) {
    expect(after.courses['react']?.lessons[lesson]).toBeUndefined();
  }
  for (const draft of Object.values(before.drafts).filter(({ lessonId }) =>
    ['react-ch02-l01', 'react-ch02-l02', 'react-ch03-l01'].includes(lessonId),
  )) {
    expect(after.drafts[`${draft.courseId}:${draft.workspaceId}`]).toBeUndefined();
    const preserved = after.quarantined
      .map(({ raw }) => raw)
      .find(
        (raw) =>
          raw !== null &&
          typeof raw === 'object' &&
          'workspaceId' in raw &&
          raw.workspaceId === draft.workspaceId &&
          'files' in raw,
      );
    expect(preserved).toBeDefined();
    expect(preserved).toMatchObject({
      files: draft.files,
      validationHistory: draft.validationHistory,
    });
  }
  for (const workspace of ['react-ch02-l01-e01', 'react-ch02-l02-e01', 'react-ch02-l03-e01']) {
    expect(after.drafts[`react:${workspace}`]).toBeUndefined();
  }
});
