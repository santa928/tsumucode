/** GitHub PagesのRepository subpathへ置くProduction成果物を静的に検証する。 */
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { normalizePublicBasePath, resolvePublicAsset } from '../src/shared/lib/resolvePublicAsset';

interface ManifestChunk {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
}

interface SmokeOptions {
  readonly distRoot: string;
  readonly basePath: string;
  readonly homeBudgetBytes: number;
}

interface CourseCatalogSummary {
  readonly courses: readonly {
    readonly id: string;
    readonly manifestPath: string;
  }[];
  readonly learningPaths: readonly {
    readonly courseIds: readonly string[];
  }[];
}

/** unknown値を安全にproperty検査できるObjectへ絞り込む。 */
function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** unknown値がstringだけの配列であることをruntimeで確認する。 */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

/** Smokeに必要なCatalog最小構造だけをruntime検証する。 */
function parseCourseCatalog(value: unknown): CourseCatalogSummary {
  if (!isUnknownRecord(value)) {
    throw new Error('Course CatalogがObjectではありません');
  }
  if (value.schemaVersion !== 2) {
    throw new Error('Course CatalogのschemaVersionは2である必要があります');
  }
  if (!Array.isArray(value.courses)) {
    throw new Error('Course Catalogにcourses配列がありません');
  }
  if (value.courses.length === 0) throw new Error('Course Catalogに公開Courseがありません');
  if (!Array.isArray(value.learningPaths)) {
    throw new Error('Course CatalogにlearningPaths配列がありません');
  }

  const courses = value.courses.map((course, index) => {
    if (!isUnknownRecord(course) || typeof course.id !== 'string') {
      throw new Error(`Course Catalogのidが文字列ではありません: index ${String(index)}`);
    }
    if (typeof course.manifestPath !== 'string') {
      throw new Error(`Course CatalogのmanifestPathが文字列ではありません: index ${String(index)}`);
    }
    if (!Array.isArray(course.lessonStarts)) {
      throw new Error(`Course CatalogのlessonStartsが配列ではありません: index ${String(index)}`);
    }
    course.lessonStarts.forEach((lessonStart, lessonIndex) => {
      if (
        !isUnknownRecord(lessonStart) ||
        typeof lessonStart.lessonId !== 'string' ||
        !isUnknownRecord(lessonStart.target) ||
        (lessonStart.target.kind !== 'slide' && lessonStart.target.kind !== 'exercise') ||
        typeof lessonStart.target.targetId !== 'string'
      ) {
        throw new Error(
          `Course CatalogのlessonStartsが不正です: index ${String(index)}, lesson ${String(lessonIndex)}`,
        );
      }
    });
    return { id: course.id, manifestPath: course.manifestPath };
  });

  const learningPaths = value.learningPaths.map((learningPath, pathIndex) => {
    if (!isUnknownRecord(learningPath) || !Array.isArray(learningPath.steps)) {
      throw new Error(`Course CatalogのLearningPathが不正です: index ${String(pathIndex)}`);
    }
    const courseIds = learningPath.steps.map((step, stepIndex) => {
      if (!isUnknownRecord(step) || typeof step.courseId !== 'string') {
        throw new Error(
          `Course CatalogのLearningPath Stepが不正です: index ${String(pathIndex)}, step ${String(stepIndex)}`,
        );
      }
      return step.courseId;
    });
    return { courseIds };
  });

  const courseIds = new Set(courses.map(({ id }) => id));
  for (const learningPath of learningPaths) {
    for (const courseId of learningPath.courseIds) {
      if (!courseIds.has(courseId)) {
        throw new Error(`LearningPathが未知Courseを参照しています: ${courseId}`);
      }
    }
  }

  return {
    courses,
    learningPaths,
  };
}

/** Smokeに必要なVite manifest chunk構造をruntime検証する。 */
function parseViteManifest(value: unknown): Readonly<Record<string, ManifestChunk>> {
  if (!isUnknownRecord(value)) throw new Error('Vite manifestがObjectではありません');

  const manifest: Record<string, ManifestChunk> = {};
  for (const [key, chunk] of Object.entries(value)) {
    if (!isUnknownRecord(chunk) || typeof chunk.file !== 'string') {
      throw new Error(`Vite manifestのfileが文字列ではありません: ${key}`);
    }
    if (chunk.isEntry !== undefined && typeof chunk.isEntry !== 'boolean') {
      throw new Error(`Vite manifestのisEntryがbooleanではありません: ${key}`);
    }
    if (chunk.imports !== undefined && !isStringArray(chunk.imports)) {
      throw new Error(`Vite manifestのimportsが文字列配列ではありません: ${key}`);
    }

    manifest[key] = {
      file: chunk.file,
      ...(typeof chunk.isEntry === 'boolean' ? { isEntry: chunk.isEntry } : {}),
      ...(isStringArray(chunk.imports) ? { imports: chunk.imports } : {}),
    };
  }
  return manifest;
}

/** Public Assetと同じcanonical相対Path契約を適用し、用途別Errorへ変換する。 */
function assertSafeRelativePath(value: string, label: string): string {
  try {
    return resolvePublicAsset('/', value).slice(1);
  } catch {
    throw new Error(`${label}は安全な相対Pathで指定してください: ${value}`);
  }
}

/** dist内の通常Fileを読み、欠落・Directory・Symlinkを対象Path付きErrorへ変換する。 */
async function readBuildFile(
  distRoot: string,
  relativePath: string,
  label: string,
): Promise<Buffer> {
  const safePath = assertSafeRelativePath(relativePath, label);
  const absolutePath = path.join(distRoot, safePath);
  try {
    const file = await lstat(absolutePath);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error('通常Fileではありません');
    return await readFile(absolutePath);
  } catch {
    throw new Error(`${label}が見つかりません: ${safePath}`);
  }
}

/** 必須JSONを読み、Syntax errorを対象Path付きErrorへ変換する。 */
async function readBuildJson(
  distRoot: string,
  relativePath: string,
  label: string,
): Promise<unknown> {
  const source = await readBuildFile(distRoot, relativePath, label);
  try {
    return JSON.parse(source.toString('utf8')) as unknown;
  } catch {
    throw new Error(`${label}が正しいJSONではありません: ${relativePath}`);
  }
}

/** Entryと静的importだけを重複なく辿り、Home初期JSのgzip bytesを集計する。 */
async function measureInitialJavaScript(
  distRoot: string,
  manifest: Readonly<Record<string, ManifestChunk>>,
): Promise<number> {
  const normalLearningEntryKey = 'src/app/normalLearningEntry.tsx';
  const entryKey = manifest[normalLearningEntryKey]?.isEntry
    ? normalLearningEntryKey
    : Object.entries(manifest).find(([, chunk]) => chunk.isEntry)?.[0];
  if (!entryKey) throw new Error('Vite manifestに通常学習Entryがありません');

  const visitedChunks = new Set<string>();
  const measuredFiles = new Set<string>();
  const visit = async (key: string): Promise<number> => {
    if (visitedChunks.has(key)) return 0;
    visitedChunks.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest参照がありません: ${key}`);

    const chunkPath = assertSafeRelativePath(chunk.file, 'Vite Chunk path');
    let ownBytes = 0;
    if (chunkPath.endsWith('.js') && !measuredFiles.has(chunkPath)) {
      measuredFiles.add(chunkPath);
      const source = await readBuildFile(distRoot, chunkPath, 'Vite Chunk');
      ownBytes = gzipSync(source).byteLength;
    }
    const importedBytes = await Promise.all((chunk.imports ?? []).map(visit));
    return ownBytes + importedBytes.reduce((sum, bytes) => sum + bytes, 0);
  };

  return visit(entryKey);
}

/** GitHub Pages project siteに必要なAsset、教材、容量Budget、Cache方針を検証する。 */
export async function assertSubpathBuild(options: SmokeOptions): Promise<void> {
  const normalizedBase = normalizePublicBasePath(options.basePath);
  const indexHtml = (await readBuildFile(options.distRoot, 'index.html', 'Index HTML')).toString(
    'utf8',
  );
  const urls = [...indexHtml.matchAll(/(?:src|href)\s*=\s*(["'])(.*?)\1/gu)].map(
    (match) => match[2] ?? '',
  );
  const outside = urls.filter((url) => url.startsWith('/') && !url.startsWith(normalizedBase));
  if (outside.length > 0) throw new Error(`BASE_PATH外のURLがあります: ${outside.join(', ')}`);

  for (const url of urls.filter((value) => value.startsWith(normalizedBase))) {
    const relativePath = url.slice(normalizedBase.length);
    await readBuildFile(options.distRoot, relativePath, 'Build Asset');
  }

  const catalog = parseCourseCatalog(
    await readBuildJson(options.distRoot, 'generated/content/catalog.json', 'Course Catalog'),
  );
  for (const course of catalog.courses) {
    const manifestPath = assertSafeRelativePath(course.manifestPath, 'Course manifestPath');
    await readBuildFile(options.distRoot, manifestPath, 'Course Manifest');
  }

  const manifest = parseViteManifest(
    await readBuildJson(options.distRoot, '.vite/manifest.json', 'Vite manifest'),
  );
  const initialBytes = await measureInitialJavaScript(options.distRoot, manifest);
  if (initialBytes > options.homeBudgetBytes) {
    throw new Error(
      `Home初期JavaScriptが${String(initialBytes)} bytesで予算${String(options.homeBudgetBytes)} bytesを超えています`,
    );
  }

  const files = await readdir(options.distRoot, { recursive: true });
  const serviceWorker = files.find((file) => /(^|\/)(sw|service-worker)\.[cm]?[jt]s$/u.test(file));
  if (serviceWorker) {
    throw new Error(`初回版へService Workerを含めないでください: ${serviceWorker}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await assertSubpathBuild({
    distRoot: path.resolve('dist'),
    basePath: process.env.BASE_PATH ?? '/',
    homeBudgetBytes: 250 * 1024,
  });
  console.log('GitHub Pages subpath smoke: PASS');
}
