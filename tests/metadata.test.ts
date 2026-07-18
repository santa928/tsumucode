import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HTML metadata', () => {
  it('GitHub PagesのBASE_URL配下からSVG faviconを読み込む', async () => {
    const html = await readFile(resolve('index.html'), 'utf8');
    const favicon = await readFile(resolve('public/favicon.svg'), 'utf8');

    expect(html).toContain('href="%BASE_URL%favicon.svg"');
    expect(html).toContain('type="image/svg+xml"');
    expect(favicon).toContain('<svg');
    expect(favicon).toContain('<title>TsumuCode</title>');
  });

  it('全主要routeで必要な公開CatalogとCourseをBASE_URL配下から先読みする', async () => {
    const html = await readFile(resolve('index.html'), 'utf8');

    expect(html).toMatch(
      /href="%BASE_URL%generated\/content\/catalog\.json"\s+as="fetch"\s+crossorigin/u,
    );
    expect(html).toMatch(
      /href="%BASE_URL%generated\/content\/courses\/html-css\.json"\s+as="fetch"\s+crossorigin/u,
    );
  });
});
