import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureCatalog, fixtureCourse } from '../../../tests/fixtures/course';
import { loadCourseCatalog, loadCourseManifest } from './loadCourseCatalog';
import type { ContentLoadError } from './loadCourseCatalog';

afterEach(() => {
  vi.unstubAllGlobals();
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
});

describe('loadCourseManifest', () => {
  it('Catalogの安全な相対PathをBASE_URL配下へ解決してCourseを再検証する', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(fixtureCourse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loadCourseManifest('/repository-name/', fixtureCatalog.courses[0]!.manifestPath),
    ).resolves.toEqual(fixtureCourse);
    expect(fetchMock).toHaveBeenCalledWith(
      '/repository-name/generated/content/courses/html-css.json',
      { headers: { Accept: 'application/json' } },
    );
  });

  it('Course Schema不一致をschema ContentLoadErrorへ分類する', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ schemaVersion: 1 }), { status: 200 })),
    );

    await expect(
      loadCourseManifest('/', fixtureCatalog.courses[0]!.manifestPath),
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

    await expect(loadCourseManifest('/repository-name/', manifestPath)).rejects.toMatchObject({
      kind: 'schema',
      resource: manifestPath,
    } satisfies Partial<ContentLoadError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
