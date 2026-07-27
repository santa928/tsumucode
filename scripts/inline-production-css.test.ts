// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inlineProductionCss } from './inline-production-css';

const temporaryRoots: string[] = [];

/** Test用の隔離dist rootを作成する。 */
async function createDist(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-inline-css-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await mkdir(path.join(root, '.vite'), { recursive: true });
  await mkdir(path.join(root, 'generated/content/courses'), { recursive: true });
  await mkdir(path.join(root, 'generated/content/assets/html-css'), { recursive: true });
  await writeFile(
    path.join(root, 'generated/content/catalog.json'),
    `${JSON.stringify({
      courses: [
        {
          manifestPath: 'generated/content/courses/html-css.json',
          publicationStatus: 'published',
        },
      ],
    })}\n`,
  );
  await writeFile(
    path.join(root, 'generated/content/courses/html-css.json'),
    `${JSON.stringify({
      id: 'html-css',
      phases: [
        {
          chapters: [
            {
              lessons: [
                {
                  id: 'lesson-one',
                  slides: [
                    {
                      id: 'slide-diagram',
                      blocks: [{ type: 'image', assetId: 'diagram' }],
                      assets: [
                        {
                          id: 'diagram',
                          mediaType: 'image',
                          path: 'generated/content/assets/html-css/diagram.svg',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })}\n`,
  );
  await writeFile(
    path.join(root, 'generated/content/assets/html-css/diagram.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
  );
  return root;
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
    expect(indexHtml).toContain(
      '"html-css/lesson-one/slide-diagram":"generated/content/assets/html-css/diagram.svg"',
    );
    expect(indexHtml).toContain("imageLink.rel='preload'");
    expect(indexHtml).toContain("imageLink.as='image'");
    expect(indexHtml).toContain("imageLink.fetchPriority='low'");
    expect(indexHtml).toContain('data-tsumucode-slide-image');
    expect(indexHtml.indexOf('data-tsumucode-slide-image')).toBeLessThan(
      indexHtml.indexOf('data-tsumucode-critical-css'),
    );
    expect(indexHtml.indexOf('data-tsumucode-entry')).toBeLessThan(indexHtml.indexOf('</body>'));
  });

  it('dist外を指すSlide Image pathはpreload Mapへ埋め込まず拒否する', async () => {
    const distRoot = await createDist();
    await writeModeBuild(distRoot);
    const coursePath = path.join(distRoot, 'generated/content/courses/html-css.json');
    const courseSource = await readFile(coursePath, 'utf8');
    await writeFile(
      coursePath,
      courseSource.replace('generated/content/assets/html-css/diagram.svg', '../diagram.svg'),
    );

    await expect(inlineProductionCss({ distRoot })).rejects.toThrow(
      'Slide Image pathがcanonicalではありません',
    );
  });

  it('非公開CourseのSlide Imageは先読みMapへ含めない', async () => {
    const distRoot = await createDist();
    await writeModeBuild(distRoot);
    const catalogPath = path.join(distRoot, 'generated/content/catalog.json');
    const catalogSource = await readFile(catalogPath, 'utf8');
    await writeFile(catalogPath, catalogSource.replace('"published"', '"draft"'));

    await inlineProductionCss({ distRoot });

    await expect(readFile(path.join(distRoot, 'index.html'), 'utf8')).resolves.not.toContain(
      '"html-css/lesson-one/slide-diagram"',
    );
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
