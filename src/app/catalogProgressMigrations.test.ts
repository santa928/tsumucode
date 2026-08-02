/** Catalog revisionを使った選択的Course Index migration境界を検証する。 */
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fixtureCatalog, fixtureCourseIndex } from '../../tests/fixtures/course';
import type { CourseCatalogEntry, CourseIndex } from '../core/content/types';
import type { CourseProgress } from '../core/persistence/contracts';
import {
  ensureCatalogCourseRevisions,
  type CatalogProgressMigrationPort,
} from './catalogProgressMigrations';

const NOW = '2026-07-31T00:00:00.000Z';

/** 指定Course entryと同じrevisionの最小進捗を作る。 */
function progressFor(
  entry: CourseCatalogEntry,
  overrides: Partial<CourseProgress> = {},
): CourseProgress {
  return {
    courseId: entry.id,
    contentRevision: entry.revision,
    lessons: {},
    currentComplete: false,
    updatedAt: NOW,
    ...overrides,
  };
}

/** 呼出契約を観測できる選択migration portを作る。 */
function createPort(
  getCourse: CatalogProgressMigrationPort['repository']['getCourse'],
): CatalogProgressMigrationPort & {
  readonly loadIndex: ReturnType<typeof vi.fn<(entry: CourseCatalogEntry) => Promise<CourseIndex>>>;
  readonly ensureCourseIndex: ReturnType<
    typeof vi.fn<(index: CourseIndex) => Promise<readonly []>>
  >;
} {
  return {
    ready: Promise.resolve(),
    repository: { getCourse },
    loadIndex: vi.fn(async () => structuredClone(fixtureCourseIndex)),
    ensureCourseIndex: vi.fn(async () => []),
  };
}

/** 2件目のCourse entryを選択migration単体用に作る。 */
function secondEntry(): CourseCatalogEntry {
  return {
    ...structuredClone(fixtureCatalog.courses[0]!),
    id: 'javascript',
    revision: '2026-07-31.javascript',
    indexPath: 'generated/content/courses/javascript/index.json',
    indexSha256: 'b'.repeat(64),
  };
}

describe('ensureCatalogCourseRevisions', () => {
  it('同revisionと未開始CourseではIndexを読まない', async () => {
    const first = fixtureCatalog.courses[0]!;
    const second = secondEntry();
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockResolvedValueOnce(progressFor(first))
      .mockResolvedValueOnce(undefined);
    const port = createPort(getCourse);

    await ensureCatalogCourseRevisions([first, second], port);

    expect(getCourse).toHaveBeenNthCalledWith(1, first.id);
    expect(getCourse).toHaveBeenNthCalledWith(2, second.id);
    expect(port.loadIndex).not.toHaveBeenCalled();
    expect(port.ensureCourseIndex).not.toHaveBeenCalled();
  });

  it('古いrevisionのCourseだけIndexを読みdescriptor migrationへ渡す', async () => {
    const entry = fixtureCatalog.courses[0]!;
    const port = createPort(
      vi.fn().mockResolvedValue(progressFor(entry, { contentRevision: 'old-revision' })),
    );

    await ensureCatalogCourseRevisions([entry], port);

    expect(port.loadIndex).toHaveBeenCalledWith(entry);
    expect(port.ensureCourseIndex).toHaveBeenCalledWith(fixtureCourseIndex);
  });

  it('重複Course IDを一度だけ読み、不正recordを移行しない', async () => {
    const entry = fixtureCatalog.courses[0]!;
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockResolvedValue(progressFor(entry, { courseId: 'different-course' }));
    const port = createPort(getCourse);

    await ensureCatalogCourseRevisions([entry, structuredClone(entry)], port);

    expect(getCourse).toHaveBeenCalledOnce();
    expect(port.loadIndex).not.toHaveBeenCalled();
  });

  it('Index読込失敗を呼出元へ返しmigrationを実行しない', async () => {
    const entry = fixtureCatalog.courses[0]!;
    const port = createPort(
      vi.fn().mockResolvedValue(progressFor(entry, { contentRevision: 'old-revision' })),
    );
    port.loadIndex.mockRejectedValue(new Error('index failed'));

    await expect(ensureCatalogCourseRevisions([entry], port)).rejects.toThrow('index failed');
    expect(port.ensureCourseIndex).not.toHaveBeenCalled();
  });
});
