import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureCatalogV3,
  fixtureCourseIndex,
  fixtureLessonManifest,
} from '../../../tests/fixtures/course';
import { loadCourseCatalog, loadCourseIndex, loadLessonManifest } from './loadCourseCatalog';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Response文字列のSHA-256を小文字hexで返す。 */
async function sourceSha256(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('分割教材Repository facade', () => {
  it('Catalog v3→Index→Lessonを同じRepository検証経路から取得する', async () => {
    const lessonSource = JSON.stringify(fixtureLessonManifest);
    const index = structuredClone(fixtureCourseIndex);
    index.phases[0]!.chapters[0]!.lessons[0]!.manifestSha256 = await sourceSha256(lessonSource);
    const indexSource = JSON.stringify(index);
    const catalog = structuredClone(fixtureCatalogV3);
    catalog.courses[0]!.indexSha256 = await sourceSha256(indexSource);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(catalog))
      .mockResolvedValueOnce(new Response(indexSource))
      .mockResolvedValueOnce(new Response(lessonSource));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadCourseCatalog('/repository-name/')).resolves.toEqual(catalog);
    await expect(loadCourseIndex('/repository-name/', catalog.courses[0]!)).resolves.toEqual(index);
    await expect(
      loadLessonManifest('/repository-name/', index, 'lesson-first-heading'),
    ).resolves.toEqual(fixtureLessonManifest);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/repository-name/generated/content/catalog-v3.json',
      { headers: { Accept: 'application/json' } },
    );
  });

  it('Catalog取得失敗をresource付きContentLoadErrorへ分類する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('missing', { status: 404 })),
    );

    await expect(loadCourseCatalog('/missing/')).rejects.toMatchObject({
      name: 'ContentLoadError',
      kind: 'http',
      resource: '/missing/generated/content/catalog-v3.json',
      status: 404,
    });
  });
});
