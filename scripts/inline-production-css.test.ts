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
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('inlineProductionCss', () => {
  it('唯一のProduction CSSをHTMLへ埋め込み、Assetとmanifest参照を除去する', async () => {
    const distRoot = await createDist();
    await writeFile(
      path.join(distRoot, 'index.html'),
      '<head><script type="module" src="/repo/assets/index.js"></script><link rel="stylesheet" crossorigin href="/repo/assets/index-hash.css"></head>\n',
    );
    await writeFile(path.join(distRoot, 'assets/index-hash.css'), 'body{color:#123}\n');
    await writeFile(
      path.join(distRoot, '.vite/manifest.json'),
      `${JSON.stringify(
        {
          'index.html': { file: 'assets/index.js', css: ['assets/index-hash.css'] },
        },
        undefined,
        2,
      )}\n`,
    );

    await inlineProductionCss({ distRoot });

    await expect(readFile(path.join(distRoot, 'index.html'), 'utf8')).resolves.toContain(
      '<style data-tsumucode-critical-css>body{color:#123}\n</style>',
    );
    await expect(readFile(path.join(distRoot, 'assets/index-hash.css'), 'utf8')).rejects.toThrow();
    await expect(
      readFile(path.join(distRoot, '.vite/manifest.json'), 'utf8'),
    ).resolves.not.toContain('index-hash.css');
  });

  it('Style終了Tagを含むCSSはHTML構造を壊すため拒否する', async () => {
    const distRoot = await createDist();
    await writeFile(
      path.join(distRoot, 'index.html'),
      '<head><script type="module" src="/repo/assets/index.js"></script><link rel="stylesheet" href="/repo/assets/index.css"></head>\n',
    );
    await writeFile(path.join(distRoot, 'assets/index.css'), '/* </style> */');
    await writeFile(
      path.join(distRoot, '.vite/manifest.json'),
      '{"index.html":{"file":"assets/index.js","css":["assets/index.css"]}}\n',
    );

    await expect(inlineProductionCss({ distRoot })).rejects.toThrow('style終了Tag');
  });
});
