import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureCatalog,
  fixtureCatalogV3,
  fixtureCourse,
  fixtureCourseIndex,
  fixtureLessonManifest,
} from '../../../tests/fixtures/course';
import {
  loadCourseCatalog,
  loadCourseCatalogV3,
  loadCourseIndex,
  loadCourseManifest,
  loadLessonManifest,
} from './loadCourseCatalog';
import type { ContentLoadError } from './loadCourseCatalog';

/** Test response文字列と一致するManifest entryをWeb Cryptoで作る。 */
async function manifestEntry(source: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const manifestSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return {
    ...fixtureCatalog.courses[0]!,
    manifestSha256,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Response文字列と一致するSHA-256を小文字hexで返す。 */
async function sourceSha256(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('v3 repository facade', () => {
  it('Catalog→Index→Lessonを同じRepository検証経路から取得する', async () => {
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

    await expect(loadCourseCatalogV3('/repository-name/')).resolves.toEqual(catalog);
    await expect(loadCourseIndex('/repository-name/', catalog.courses[0]!)).resolves.toEqual(index);
    await expect(
      loadLessonManifest('/repository-name/', index, 'lesson-first-heading'),
    ).resolves.toEqual(fixtureLessonManifest);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('loadCourseCatalog', () => {
  it('BASE_URL配下のCatalogを同一Originから取得してSchema検証する', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(fixtureCatalog), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadCourseCatalog('/repository-name/')).resolves.toEqual(fixtureCatalog);
    expect(fetchMock).toHaveBeenCalledWith('/repository-name/generated/content/catalog.json', {
      headers: { Accept: 'application/json' },
    });
  });

  it('network失敗をhttp ContentLoadErrorへ分類する', async () => {
    const networkError = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(networkError));

    await expect(loadCourseCatalog('/')).rejects.toMatchObject({
      name: 'ContentLoadError',
      kind: 'http',
      resource: '/generated/content/catalog.json',
      cause: networkError,
      message: '教材を読み込めませんでした。通信を確認して、もう一度お試しください。',
    } satisfies Partial<ContentLoadError>);
  });

  it('HTTP status失敗をhttp ContentLoadErrorへ分類する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('missing', { status: 404 })),
    );

    await expect(loadCourseCatalog('/')).rejects.toMatchObject({
      kind: 'http',
      resource: '/generated/content/catalog.json',
      cause: 404,
    } satisfies Partial<ContentLoadError>);
  });

  it('JSON parse失敗をjson ContentLoadErrorへ分類する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{', { status: 200 })),
    );

    await expect(loadCourseCatalog('/')).rejects.toMatchObject({
      kind: 'json',
      resource: '/generated/content/catalog.json',
    } satisfies Partial<ContentLoadError>);
  });

  it('Catalog Schema不一致をschema ContentLoadErrorへ分類する', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ schemaVersion: 99, courses: [] }), { status: 200 }),
        ),
    );

    await expect(loadCourseCatalog('/')).rejects.toMatchObject({
      kind: 'schema',
      resource: '/generated/content/catalog.json',
    } satisfies Partial<ContentLoadError>);
  });

  it('Catalog v1を曖昧に受理せずschema ContentLoadErrorへ分類する', async () => {
    const legacy = { ...structuredClone(fixtureCatalog), schemaVersion: 1 };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json(legacy)));

    await expect(loadCourseCatalog('/')).rejects.toMatchObject({
      kind: 'schema',
      resource: '/generated/content/catalog.json',
    } satisfies Partial<ContentLoadError>);
  });
});

describe('loadCourseManifest', () => {
  it('Catalogの安全な相対PathをBASE_URL配下へ解決してCourseを再検証する', async () => {
    const source = JSON.stringify(fixtureCourse);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(source, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loadCourseManifest('/repository-name/', await manifestEntry(source)),
    ).resolves.toEqual(fixtureCourse);
    expect(fetchMock).toHaveBeenCalledWith(
      '/repository-name/generated/content/courses/html-css.json',
      { headers: { Accept: 'application/json' } },
    );
  });

  it('Course Schema不一致をschema ContentLoadErrorへ分類する', async () => {
    const source = JSON.stringify({ schemaVersion: 1 });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(source, { status: 200 })),
    );

    await expect(loadCourseManifest('/', await manifestEntry(source))).rejects.toMatchObject({
      kind: 'schema',
      resource: '/generated/content/courses/html-css.json',
    } satisfies Partial<ContentLoadError>);
  });

  it('CatalogのSHA-256と異なるCourse bytesをintegrity ContentLoadErrorへ分類する', async () => {
    const source = JSON.stringify(fixtureCourse);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(source, { status: 200 })),
    );

    await expect(
      loadCourseManifest('/', {
        ...(await manifestEntry(source)),
        manifestSha256: 'f'.repeat(64),
      }),
    ).rejects.toMatchObject({
      kind: 'integrity',
      resource: '/generated/content/courses/html-css.json',
    } satisfies Partial<ContentLoadError>);
  });

  it('CatalogとCourseの公開Metadata不一致をschema ContentLoadErrorへ分類する', async () => {
    const source = JSON.stringify(fixtureCourse);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(source, { status: 200 })),
    );

    await expect(
      loadCourseManifest('/', {
        ...(await manifestEntry(source)),
        publicationStatus: fixtureCourse.publicationStatus === 'published' ? 'draft' : 'published',
      }),
    ).rejects.toMatchObject({
      kind: 'schema',
      resource: '/generated/content/courses/html-css.json',
    } satisfies Partial<ContentLoadError>);
  });

  it.each([
    '../private/course.json',
    '%2e%2e/private/course.json',
    'https://evil.example/course.json',
    '//evil.example/course.json',
    'generated/content/courses/html-css.json?raw=1',
  ])('安全でないManifest pathをfetch前に拒否する: %s', async (manifestPath) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loadCourseManifest('/repository-name/', {
        ...fixtureCatalog.courses[0]!,
        manifestPath,
      }),
    ).rejects.toMatchObject({
      kind: 'schema',
      resource: manifestPath,
    } satisfies Partial<ContentLoadError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
