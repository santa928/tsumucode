/** Catalog revisionを使った選択的Course migration境界を検証する。 */
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  fixtureCatalog,
  fixtureCatalogV3,
  fixtureCourse,
  fixtureCourseIndex,
} from '../../tests/fixtures/course';
import type {
  CourseCatalogEntry,
  CourseCatalogEntryV3,
  CourseIndex,
  CourseManifest,
} from '../core/content/types';
import type { CourseProgress } from '../core/persistence/contracts';
import {
  ensureCatalogCourseRevisions,
  ensureCatalogCourseIndexRevisions,
  type CatalogProgressIndexMigrationPort,
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
  readonly loadManifest: ReturnType<
    typeof vi.fn<(entry: CourseCatalogEntry) => Promise<CourseManifest>>
  >;
  readonly ensureCourse: ReturnType<typeof vi.fn<(course: CourseManifest) => Promise<void>>>;
} {
  return {
    ready: Promise.resolve(),
    repository: { getCourse },
    loadManifest: vi.fn(async () => fixtureCourse),
    ensureCourse: vi.fn(async () => undefined),
  };
}

/** 2件目のCourse entryをCatalog制約に依存せず選択migration単体用に作る。 */
function secondEntry(): CourseCatalogEntry {
  return {
    ...structuredClone(fixtureCatalog.courses[0]!),
    id: 'javascript',
    revision: '2026-07-31.javascript',
    manifestPath: 'generated/content/courses/javascript.json',
    manifestSha256: 'b'.repeat(64),
  };
}

describe('ensureCatalogCourseRevisions', () => {
  it('同revisionと未開始CourseではManifestを読まない', async () => {
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
    expect(port.loadManifest).not.toHaveBeenCalled();
    expect(port.ensureCourse).not.toHaveBeenCalled();
  });

  it('古いrevisionのCourseだけManifestを読み既存migrationへ渡す', async () => {
    const entry = fixtureCatalog.courses[0]!;
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockResolvedValue(progressFor(entry, { contentRevision: 'old-revision' }));
    const port = createPort(getCourse);

    await ensureCatalogCourseRevisions([entry], port);

    expect(port.loadManifest).toHaveBeenCalledOnce();
    expect(port.loadManifest).toHaveBeenCalledWith(entry);
    expect(port.ensureCourse).toHaveBeenCalledOnce();
    expect(port.ensureCourse).toHaveBeenCalledWith(fixtureCourse);
  });

  it('重複Course IDを一度だけ読み、別Course IDの不正recordを移行しない', async () => {
    const entry = fixtureCatalog.courses[0]!;
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockResolvedValue(progressFor(entry, { courseId: 'different-course' }));
    const port = createPort(getCourse);

    await ensureCatalogCourseRevisions([entry, structuredClone(entry)], port);

    expect(getCourse).toHaveBeenCalledOnce();
    expect(port.loadManifest).not.toHaveBeenCalled();
    expect(port.ensureCourse).not.toHaveBeenCalled();
  });

  it('Manifest読込失敗を呼出元へ返しensureCourseを実行しない', async () => {
    const entry = fixtureCatalog.courses[0]!;
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockResolvedValue(progressFor(entry, { contentRevision: 'old-revision' }));
    const port = createPort(getCourse);
    port.loadManifest.mockRejectedValue(new Error('manifest failed'));

    await expect(ensureCatalogCourseRevisions([entry], port)).rejects.toThrow('manifest failed');
    expect(port.ensureCourse).not.toHaveBeenCalled();
  });
});

describe('ensureCatalogCourseIndexRevisions', () => {
  it('古いrevisionのCourseだけIndexを読みdescriptor migrationへ渡す', async () => {
    const entry = fixtureCatalogV3.courses[0]!;
    const loadIndex = vi.fn<(entry: CourseCatalogEntryV3) => Promise<CourseIndex>>(async () =>
      structuredClone(fixtureCourseIndex),
    );
    const ensureCourseIndex = vi.fn<(index: CourseIndex) => Promise<readonly []>>(async () => []);
    const port: CatalogProgressIndexMigrationPort = {
      ready: Promise.resolve(),
      repository: {
        getCourse: vi
          .fn()
          .mockResolvedValue(
            progressFor(
              { ...fixtureCatalog.courses[0]!, revision: entry.revision },
              { contentRevision: 'old-revision' },
            ),
          ),
      },
      loadIndex,
      ensureCourseIndex,
    };

    await ensureCatalogCourseIndexRevisions([entry], port);

    expect(loadIndex).toHaveBeenCalledWith(entry);
    expect(ensureCourseIndex).toHaveBeenCalledWith(fixtureCourseIndex);
  });
});
