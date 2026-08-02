// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { inlineProductionCss } from './inline-production-css';

const temporaryRoots: string[] = [];

/** Test用の隔離dist rootを作成する。 */
async function createDist(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-inline-css-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await mkdir(path.join(root, '.vite'), { recursive: true });
  await mkdir(path.join(root, 'generated/content/courses/html-css/lessons'), {
    recursive: true,
  });
  return root;
}

/** Test用の公開Catalogを書き出す。 */
async function writeCatalog(
  distRoot: string,
  courses: readonly Readonly<Record<string, unknown>>[],
): Promise<void> {
  await writeFile(
    path.join(distRoot, 'generated/content/catalog-v3.json'),
    `${JSON.stringify({ schemaVersion: 3, courses, learningPaths: [] })}\n`,
  );
}

/** Test用Course IndexとLesson Artifactを書き出す。 */
async function writeCourseIndex(
  distRoot: string,
  lessons: readonly Readonly<Record<string, unknown>>[] = [
    {
      id: 'html-css-ch00-l01',
      manifestPath: 'generated/content/courses/html-css/lessons/html-css-ch00-l01.json',
    },
  ],
): Promise<void> {
  await writeFile(
    path.join(distRoot, 'generated/content/courses/html-css/index.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      id: 'html-css',
      phases: [{ chapters: [{ lessons }] }],
    })}\n`,
  );
  for (const lesson of lessons) {
    if (typeof lesson.manifestPath !== 'string') continue;
    const target = path.join(distRoot, ...lesson.manifestPath.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '{}\n');
  }
}

/** Mode entryと単一CSSを持つ正常な最小Buildを作成する。 */
async function writeModeBuild(distRoot: string): Promise<void> {
  await writeFile(
    path.join(distRoot, 'index.html'),
    '<head><link rel="stylesheet" crossorigin href="/repo/assets/index-hash.css"></head><body><div id="root"></div></body>\n',
  );
  await writeFile(path.join(distRoot, 'assets/index-hash.css'), 'body{color:#123}\n');
  await writeFile(path.join(distRoot, 'assets/normal-entry.js'), 'export {};\n');
  await writeFile(path.join(distRoot, 'assets/library-entry.js'), 'export {};\n');
  await writeFile(path.join(distRoot, 'assets/mode-shared.js'), 'export {};\n');
  await writeCourseIndex(distRoot);
  await writeCatalog(distRoot, [
    {
      id: 'html-css',
      indexPath: 'generated/content/courses/html-css/index.json',
    },
  ]);
  await writeFile(
    path.join(distRoot, '.vite/manifest.json'),
    `${JSON.stringify(
      {
        'src/app/normalLearningEntry.tsx': {
          file: 'assets/normal-entry.js',
          imports: ['_mode-shared.js'],
        },
        'src/app/libraryEntry.tsx': {
          file: 'assets/library-entry.js',
          imports: ['_mode-shared.js'],
        },
        '_mode-shared.js': { file: 'assets/mode-shared.js' },
        'style.css': { file: 'assets/index-hash.css', src: 'style.css' },
      },
      undefined,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('inlineProductionCss', () => {
  it.each([
    ['#/courses/html-css', 1, 0],
    ['#/library/html-css', 1, 0],
    ['#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01', 1, 1],
    ['#/courses/html-css/lessons/html-css-ch00-l01/exercises/html-css-ch00-l01-e01', 1, 1],
    ['#/library/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01', 1, 1],
  ])(
    '%s はIndex %i件、Lesson %i件だけをentryと並行先読みする',
    async (hash, indexCount, lessonCount) => {
      const distRoot = await createDist();
      await writeModeBuild(distRoot);

      await inlineProductionCss({ distRoot });

      const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');
      const document = new JSDOM(html, {
        runScripts: 'dangerously',
        url: `https://example.test/repo/${hash}`,
      }).window.document;
      const indexPreloads = document.querySelectorAll<HTMLLinkElement>(
        'link[data-tsumucode-course-index-preload]',
      );
      const lessonPreloads = document.querySelectorAll<HTMLLinkElement>(
        'link[data-tsumucode-lesson-preload]',
      );
      expect(indexPreloads).toHaveLength(indexCount);
      expect(lessonPreloads).toHaveLength(lessonCount);
      if (indexCount === 1) {
        expect(indexPreloads[0]?.rel).toBe('preload');
        expect(indexPreloads[0]?.as).toBe('fetch');
        expect(indexPreloads[0]?.crossOrigin).toBe('anonymous');
        expect(indexPreloads[0]?.href).toBe(
          'https://example.test/repo/generated/content/courses/html-css/index.json',
        );
      }
      if (lessonCount === 1) {
        expect(lessonPreloads[0]?.href).toBe(
          'https://example.test/repo/generated/content/courses/html-css/lessons/html-css-ch00-l01.json',
        );
      }
    },
  );

  it.each([
    '#/',
    '#/courses/unknown',
    '#/courses/constructor',
    '#/courses/HTML-CSS',
    '#/courses/html-css%2Flessons%2Fhtml-css-ch00-l01',
  ])('対象Courseを特定できないHash %s では教材を先読みしない', async (hash) => {
    const distRoot = await createDist();
    await writeModeBuild(distRoot);

    await inlineProductionCss({ distRoot });

    const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');
    const document = new JSDOM(html, {
      runScripts: 'dangerously',
      url: `https://example.test/repo/${hash}`,
    }).window.document;
    expect(document.querySelector('link[data-tsumucode-course-index-preload]')).toBeNull();
    expect(document.querySelector('link[data-tsumucode-lesson-preload]')).toBeNull();
  });

  it('重複するCourse idは対応manifestを曖昧にするため拒否する', async () => {
    const distRoot = await createDist();
    await writeModeBuild(distRoot);
    await writeCatalog(distRoot, [
      { id: 'html-css', indexPath: 'generated/content/courses/html-css/index.json' },
      { id: 'html-css', indexPath: 'generated/content/courses/html-css/index.json' },
    ]);

    await expect(inlineProductionCss({ distRoot })).rejects.toThrow(
      '公開CatalogのCourse idが重複しています: html-css',
    );
  });

  it.each(['../private.json', 'generated/content/courses/html-css/index.json?raw=1'])(
    '危険なCourse index path %s はBootstrapへ埋め込まず拒否する',
    async (indexPath) => {
      const distRoot = await createDist();
      await writeModeBuild(distRoot);
      await writeCatalog(distRoot, [{ id: 'html-css', indexPath }]);

      await expect(inlineProductionCss({ distRoot })).rejects.toThrow('Public Asset path');
    },
  );

  it.each([
    '../private.json',
    'generated/content/courses/html-css/lessons/html-css-ch00-l01.json?raw=1',
  ])('危険なLesson manifest path %s はBootstrapへ埋め込まず拒否する', async (manifestPath) => {
    const distRoot = await createDist();
    await writeModeBuild(distRoot);
    await writeCourseIndex(distRoot, [{ id: 'html-css-ch00-l01', manifestPath }]);

    await expect(inlineProductionCss({ distRoot })).rejects.toThrow('Public Asset path');
  });

  it('Production CSSをHTMLへ埋め込み、遅延Chunk用のAssetとmanifest参照は維持する', async () => {
    const distRoot = await createDist();
    await writeModeBuild(distRoot);

    await inlineProductionCss({ distRoot });

    await expect(readFile(path.join(distRoot, 'index.html'), 'utf8')).resolves.toContain(
      '<style data-tsumucode-critical-css>body{color:#123}\n</style>',
    );
    await expect(readFile(path.join(distRoot, 'assets/index-hash.css'), 'utf8')).resolves.toBe(
      'body{color:#123}\n',
    );
    await expect(readFile(path.join(distRoot, '.vite/manifest.json'), 'utf8')).resolves.toContain(
      'index-hash.css',
    );
    const indexHtml = await readFile(path.join(distRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain('data-tsumucode-entry');
    expect(indexHtml).toContain('^#\\/library');
    expect(indexHtml).toContain('assets/normal-entry.js');
    expect(indexHtml).toContain('assets/library-entry.js');
    expect(indexHtml).toContain('assets/mode-shared.js');
    expect(indexHtml).toContain("link.rel='modulepreload'");
    expect(indexHtml).not.toContain('data-tsumucode-slide-image');
    expect(indexHtml.indexOf('data-tsumucode-entry')).toBeLessThan(indexHtml.indexOf('</body>'));
  });

  it('Style終了Tagを含むCSSはHTML構造を壊すため拒否する', async () => {
    const distRoot = await createDist();
    await writeFile(
      path.join(distRoot, 'index.html'),
      '<head><script type="module" src="/repo/assets/index.js"></script><link rel="stylesheet" href="/repo/assets/index.css"></head>\n',
    );
    await writeFile(path.join(distRoot, 'assets/index.css'), '/* </style> */');
    await writeFile(path.join(distRoot, 'assets/index.js'), 'export {};\n');
    await writeFile(
      path.join(distRoot, '.vite/manifest.json'),
      `${JSON.stringify({
        'index.html': { file: 'assets/index.js', css: ['assets/index.css'] },
      })}\n`,
    );

    await expect(inlineProductionCss({ distRoot })).rejects.toThrow('style終了Tag');
  });

  it('Mode entryがmanifestにないBuildは初期Route選択を保証できないため拒否する', async () => {
    const distRoot = await createDist();
    await writeFile(
      path.join(distRoot, 'index.html'),
      '<head><script type="module" src="/repo/assets/index.js"></script><link rel="stylesheet" href="/repo/assets/index.css"></head>\n',
    );
    await writeFile(path.join(distRoot, 'assets/index.css'), 'body{color:#123}');
    await writeFile(path.join(distRoot, '.vite/manifest.json'), '{}\n');

    await expect(inlineProductionCss({ distRoot })).rejects.toThrow('Vite Mode entryがありません');
  });

  it('dist外を指すMode Asset pathはBootstrapへ埋め込まず拒否する', async () => {
    const distRoot = await createDist();
    await writeFile(
      path.join(distRoot, 'index.html'),
      '<head><script type="module" src="/repo/assets/index.js"></script><link rel="stylesheet" href="/repo/assets/index.css"></head>\n',
    );
    await writeFile(path.join(distRoot, 'assets/index.css'), 'body{color:#123}');
    await writeFile(path.join(distRoot, 'assets/normal-entry.js'), 'export {};\n');
    await writeFile(
      path.join(distRoot, '.vite/manifest.json'),
      `${JSON.stringify({
        'src/app/normalLearningEntry.tsx': { file: 'assets/normal-entry.js' },
        'src/app/libraryEntry.tsx': { file: '../library-entry.js' },
      })}\n`,
    );

    await expect(inlineProductionCss({ distRoot })).rejects.toThrow(
      'Vite JavaScript chunk pathがcanonicalではありません',
    );
  });
});
