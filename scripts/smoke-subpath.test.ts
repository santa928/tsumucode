// @vitest-environment node
/** GitHub PagesのRepository subpathへ置くProduction成果物をfail-closedに検証する。 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertSubpathBuild } from './smoke-subpath';

interface FixtureOptions {
  readonly indexHtml?: string;
  readonly entryJavaScript?: string;
  readonly manifest?: unknown;
  readonly catalogManifestPath?: string;
  readonly catalog?: unknown;
}

const roots: string[] = [];
const defaultIndexHtml = `<!doctype html>
<html lang="ja">
  <head>
    <link rel="icon" href="/repository-name/favicon.svg" />
    <link rel="stylesheet" href="/repository-name/assets/index.css" />
    <script type="module" src="/repository-name/assets/index.js"></script>
  </head>
</html>`;

/** Testごとに独立した最小Production成果物を作り、検証対象Pathを返す。 */
async function createFixture(options: FixtureOptions = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tsumucode-subpath-'));
  roots.push(root);
  await mkdir(path.join(root, '.vite'), { recursive: true });
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await mkdir(path.join(root, 'generated/content/courses'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), options.indexHtml ?? defaultIndexHtml);
  await writeFile(path.join(root, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(path.join(root, 'assets/index.css'), 'body { color: #123; }');
  await writeFile(
    path.join(root, 'assets/index.js'),
    options.entryJavaScript ?? 'import "./shared.js"; console.log("ok");',
  );
  await writeFile(path.join(root, 'assets/shared.js'), 'export const shared = true;');
  await writeFile(
    path.join(root, '.vite/manifest.json'),
    JSON.stringify(
      options.manifest ?? {
        'index.html': {
          file: 'assets/index.js',
          isEntry: true,
          imports: ['_shared.js'],
        },
        '_shared.js': { file: 'assets/shared.js' },
      },
    ),
  );
  const manifestPath = options.catalogManifestPath ?? 'generated/content/courses/html-css.json';
  await writeFile(
    path.join(root, 'generated/content/catalog.json'),
    JSON.stringify(options.catalog ?? { courses: [{ manifestPath }] }),
  );
  await writeFile(path.join(root, 'generated/content/courses/html-css.json'), '{}');
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('subpath build smoke', () => {
  it('必要なAsset、教材、静的Importが揃ったRepository subpath Buildを受理する', async () => {
    const distRoot = await createFixture();

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).resolves.toBeUndefined();
  });

  it('Repository subpathの外へ出るRoot Asset URLを拒否する', async () => {
    const distRoot = await createFixture({
      indexHtml: '<script type="module" src="/assets/index.js"></script>',
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('BASE_PATH外のURLがあります: /assets/index.js');
  });

  it('Index HTMLが参照する欠落AssetをPath付きで拒否する', async () => {
    const distRoot = await createFixture();
    await rm(path.join(distRoot, 'assets/index.css'));

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Build Assetが見つかりません: assets/index.css');
  });

  it('Catalogの安全でないCourse manifestPathをFilesystem参照前に拒否する', async () => {
    const distRoot = await createFixture({ catalogManifestPath: '../secret.json' });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Course manifestPathは安全な相対Pathで指定してください: ../secret.json');
  });

  it('Catalog entryのmanifestPath欠落を構造Errorとして拒否する', async () => {
    const distRoot = await createFixture({ catalog: { courses: [{}] } });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Course CatalogのmanifestPathが文字列ではありません: index 0');
  });

  it('公開Courseが0件のCatalogを拒否する', async () => {
    const distRoot = await createFixture({ catalog: { courses: [] } });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Course Catalogに公開Courseがありません');
  });

  it('欠落したCourse ManifestをPath付きで拒否する', async () => {
    const distRoot = await createFixture({
      catalogManifestPath: 'generated/content/courses/missing.json',
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Course Manifestが見つかりません: generated/content/courses/missing.json');
  });

  it('Vite manifestのEntry欠落を拒否する', async () => {
    const distRoot = await createFixture({
      manifest: { 'index.html': { file: 'assets/index.js' } },
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Vite manifestにEntryがありません');
  });

  it('Vite manifestの欠落した静的Import参照を拒否する', async () => {
    const distRoot = await createFixture({
      manifest: {
        'index.html': {
          file: 'assets/index.js',
          isEntry: true,
          imports: ['_missing.js'],
        },
      },
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Vite manifest参照がありません: _missing.js');
  });

  it('Vite manifestの文字列ではない静的Importを構造Errorとして拒否する', async () => {
    const distRoot = await createFixture({
      manifest: {
        'index.html': {
          file: 'assets/index.js',
          isEntry: true,
          imports: [42],
        },
      },
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Vite manifestのimportsが文字列配列ではありません: index.html');
  });

  it('Home初期JavaScriptのgzip予算超過を拒否する', async () => {
    const distRoot = await createFixture();

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 1,
      }),
    ).rejects.toThrow(/Home初期JavaScriptが\d+ bytesで予算1 bytesを超えています/u);
  });

  it.each(['sw.js', 'service-worker.js', 'nested/service-worker.mjs'])(
    '初回版のService Workerを拒否する: %s',
    async (serviceWorker) => {
      const distRoot = await createFixture();
      await mkdir(path.dirname(path.join(distRoot, serviceWorker)), { recursive: true });
      await writeFile(
        path.join(distRoot, serviceWorker),
        'self.addEventListener("fetch", () => {});',
      );

      await expect(
        assertSubpathBuild({
          distRoot,
          basePath: '/repository-name/',
          homeBudgetBytes: 250 * 1024,
        }),
      ).rejects.toThrow(`初回版へService Workerを含めないでください: ${serviceWorker}`);
    },
  );
});
