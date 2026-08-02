import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureCatalogV3,
  fixtureCourseIndex,
  fixtureLessonManifest,
} from '../../../tests/fixtures/course';
import type { CourseCatalogEntryV3, CourseIndex } from './types';
import { CourseContentRepository } from './CourseContentRepository';

/** Response bytesと同じSHA-256を小文字hexで返す。 */
async function sha256(source: string | Uint8Array): Promise<string> {
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHAが実際のLesson／Index response bytesへ一致するRepository fixtureを作る。 */
async function repositoryFixture(): Promise<{
  readonly entry: CourseCatalogEntryV3;
  readonly index: CourseIndex;
  readonly indexSource: string;
  readonly lessonSource: string;
}> {
  const lessonSource = JSON.stringify(fixtureLessonManifest);
  const index = structuredClone(fixtureCourseIndex);
  index.phases[0]!.chapters[0]!.lessons[0]!.manifestSha256 = await sha256(lessonSource);
  const indexSource = JSON.stringify(index);
  return {
    entry: {
      ...structuredClone(fixtureCatalogV3.courses[0]!),
      indexSha256: await sha256(indexSource),
    },
    index,
    indexSource,
    lessonSource,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CourseContentRepository', () => {
  it('同じIndexの同時取得を1 fetchへ集約する', async () => {
    const repository = new CourseContentRepository();
    const { entry, indexSource } = await repositoryFixture();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(indexSource));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      repository.loadCourseIndex('/', entry),
      repository.loadCourseIndex('/', entry),
    ]);

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('失敗Promiseを除去して同じLessonを再試行する', async () => {
    const repository = new CourseContentRepository();
    const { index, lessonSource } = await repositoryFixture();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(lessonSource));
    vi.stubGlobal('fetch', fetchMock);

    await expect(repository.loadLesson('/', index, 'lesson-first-heading')).rejects.toMatchObject({
      kind: 'http',
    });
    await expect(repository.loadLesson('/', index, 'lesson-first-heading')).resolves.toEqual(
      fixtureLessonManifest,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP statusをContentLoadErrorへ保持する', async () => {
    const repository = new CourseContentRepository();
    const { entry } = await repositoryFixture();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 410 })),
    );

    await expect(repository.loadCourseIndex('/', entry)).rejects.toMatchObject({
      kind: 'http',
      status: 410,
    });
  });

  it('Catalog entryと異なるIndex bytesをintegrity失敗にする', async () => {
    const repository = new CourseContentRepository();
    const { entry, indexSource } = await repositoryFixture();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(indexSource)));

    await expect(
      repository.loadCourseIndex('/', { ...entry, indexSha256: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ kind: 'integrity' });
  });

  it('fatal UTF-8 decode失敗をjsonへ分類する', async () => {
    const repository = new CourseContentRepository();
    const { entry } = await repositoryFixture();
    const bytes = Uint8Array.from([0xff]);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes)));

    await expect(
      repository.loadCourseIndex('/', { ...entry, indexSha256: await sha256(bytes) }),
    ).rejects.toMatchObject({ kind: 'json' });
  });

  it('JSON構文とstrict schemaの失敗を区別する', async () => {
    const syntaxRepository = new CourseContentRepository();
    const schemaRepository = new CourseContentRepository();
    const { entry, index } = await repositoryFixture();
    const invalidJson = '{';
    const invalidSchema = JSON.stringify({ ...index, unexpected: true });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(invalidJson))
      .mockResolvedValueOnce(new Response(invalidSchema));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      syntaxRepository.loadCourseIndex('/', {
        ...entry,
        indexSha256: await sha256(invalidJson),
      }),
    ).rejects.toMatchObject({ kind: 'json' });
    await expect(
      schemaRepository.loadCourseIndex('/', {
        ...entry,
        indexSha256: await sha256(invalidSchema),
      }),
    ).rejects.toMatchObject({ kind: 'schema' });
  });

  it('unsafe Index pathと未知Lessonをfetch前に拒否する', async () => {
    const repository = new CourseContentRepository();
    const { entry, index } = await repositoryFixture();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      repository.loadCourseIndex('/', { ...entry, indexPath: '../private.json' }),
    ).rejects.toMatchObject({ kind: 'schema' });
    await expect(repository.loadLesson('/', index, 'missing-lesson')).rejects.toMatchObject({
      kind: 'schema',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
