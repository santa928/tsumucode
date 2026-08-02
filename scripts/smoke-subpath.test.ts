// @vitest-environment node
/** GitHub PagesのRepository subpathへ置くProduction成果物をfail-closedに検証する。 */
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CourseCatalogV3, CourseIndex } from '../src/core/content/types';
import {
  fixtureCatalogV3,
  fixtureCourseIndex,
  fixtureLessonManifest,
} from '../tests/fixtures/course';
import { stringifyCanonicalJson } from './content/compileCourse';
import { assertSubpathBuild } from './smoke-subpath';

interface FixtureOptions {
  readonly indexHtml?: string;
  readonly entryJavaScript?: string;
  readonly manifest?: unknown;
  readonly catalogIndexPath?: string;
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

/** bytesのSHA-256を小文字hexで返す。 */
function sha256(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/** Testごとに独立した最小Production成果物を作り、検証対象Pathを返す。 */
async function createFixture(options: FixtureOptions = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tsumucode-subpath-'));
  roots.push(root);
  await mkdir(path.join(root, '.vite'), { recursive: true });
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await mkdir(path.join(root, 'generated/content/courses/html-css/lessons'), { recursive: true });
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
  const lessonSource = stringifyCanonicalJson(fixtureLessonManifest);
  const courseIndex = structuredClone(fixtureCourseIndex) as {
    phases: { chapters: { lessons: { manifestSha256: string }[] }[] }[];
  } & CourseIndex;
  courseIndex.phases[0]!.chapters[0]!.lessons[0]!.manifestSha256 = sha256(lessonSource);
  const courseIndexSource = stringifyCanonicalJson(courseIndex);
  const catalog = structuredClone(fixtureCatalogV3) as {
    courses: { indexPath: string; indexSha256: string }[];
  } & CourseCatalogV3;
  catalog.courses[0]!.indexPath =
    options.catalogIndexPath ?? 'generated/content/courses/html-css/index.json';
  catalog.courses[0]!.indexSha256 = sha256(courseIndexSource);
  await writeFile(
    path.join(root, 'generated/content/catalog-v3.json'),
    stringifyCanonicalJson(options.catalog ?? catalog),
  );
  await writeFile(
    path.join(root, 'generated/content/courses/html-css/index.json'),
    courseIndexSource,
  );
  await writeFile(
    path.join(root, 'generated/content/courses/html-css/lessons/lesson-first-heading.json'),
    lessonSource,
  );
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('subpath build smoke', () => {
  it('Catalog v3・Course Index・Lessonを含むRepository subpath Buildを受理する', async () => {
    const distRoot = await createFixture();

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).resolves.toBeUndefined();
  });

  it('Catalog v2を後方互換と誤認せず拒否する', async () => {
    const distRoot = await createFixture({
      catalog: {
        schemaVersion: 2,
        courses: [
          {
            id: 'html-css',
            manifestPath: 'generated/content/courses/html-css.json',
          },
        ],
      },
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow(/schemaVersion/u);
  });

  it('LearningPathが参照する未知Courseを拒否する', async () => {
    const catalog = structuredClone(fixtureCatalogV3) as {
      learningPaths: { steps: { courseId: string }[] }[];
    };
    catalog.learningPaths[0]!.steps[0]!.courseId = 'unknown-course';
    const distRoot = await createFixture({ catalog });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow(/LearningPath Course参照先がありません/u);
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

  it('Catalogの安全でないCourse indexPathをFilesystem参照前に拒否する', async () => {
    const distRoot = await createFixture({ catalogIndexPath: '../secret.json' });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow(/安全な相対Path/u);
  });

  it('Catalog entryのindexPath欠落を構造Errorとして拒否する', async () => {
    const distRoot = await createFixture({
      catalog: {
        schemaVersion: 3,
        courses: [{ id: 'html-css', lessonStarts: [] }],
        learningPaths: [],
      },
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow(/indexPath/u);
  });

  it('公開Courseが0件のCatalogを拒否する', async () => {
    const distRoot = await createFixture({
      catalog: { schemaVersion: 3, courses: [], learningPaths: [] },
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow(/Too small/u);
  });

  it('欠落したCourse IndexをPath付きで拒否する', async () => {
    const distRoot = await createFixture();
    await rm(path.join(distRoot, 'generated/content/courses/html-css/index.json'));

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('教材Source Fileがありません: generated/content/courses/html-css/index.json');
  });

  it('Vite manifestの通常学習Entry欠落を拒否する', async () => {
    const distRoot = await createFixture({
      manifest: { 'index.html': { file: 'assets/index.js' } },
    });

    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: '/repository-name/',
        homeBudgetBytes: 250 * 1024,
      }),
    ).rejects.toThrow('Vite manifestに通常学習Entryがありません');
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
