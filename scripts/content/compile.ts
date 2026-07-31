/** 全Courseを決定的にCompileし、検証成功時だけgenerated/contentを差し替える。 */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CourseCatalogSchema } from '../../src/core/content/schema';
import { lessonStartTarget } from '../../src/core/content/lessonStart';
import type {
  CourseCatalog,
  CourseManifest,
  LearningPathDefinition,
} from '../../src/core/content/types';
import {
  compileCourse,
  stringifyCanonicalJson,
  type CompiledCourseArtifacts,
} from './compileCourse';
import { resolveInside } from './io';
import { compileLearningPaths } from './learningPaths';

export interface CompileContentOptions {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly checkOnly: boolean;
}

export interface CompilationSummary {
  readonly catalog: CourseCatalog;
  readonly courseCount: number;
  readonly warnings: readonly string[];
}

/** candidateがroot自身またはroot配下かを判定する。 */
function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

/** Pathが存在するかを例外の種類を限定して確認する。 */
async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** 既存Path componentにsymlinkが含まれないことを確認する。 */
async function assertNoExistingSymlinkComponents(target: string): Promise<void> {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const segments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`Compiler Pathにsymlinkは使用できません: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

/** Source／Outputの削除安全境界をFilesystem変更前に検証する。 */
async function validateCompilerRoots(sourceRoot: string, outputRoot: string): Promise<void> {
  if (
    path.basename(outputRoot) !== 'content' ||
    path.basename(path.dirname(outputRoot)) !== 'generated'
  ) {
    throw new Error('Compiler outputRootはgenerated/contentで終わる必要があります。');
  }
  if (isInside(sourceRoot, outputRoot) || isInside(outputRoot, sourceRoot)) {
    throw new Error('CompilerのSourceとOutputを同一または包含関係にできません。');
  }
  await assertNoExistingSymlinkComponents(sourceRoot);
  await assertNoExistingSymlinkComponents(path.dirname(outputRoot));
  const sourceStats = await lstat(sourceRoot);
  if (!sourceStats.isDirectory())
    throw new Error('Compiler sourceRootはDirectoryで指定してください。');
}

/** Source Root直下のCourse DirectoryをsymlinkなしでASCII順に返す。 */
async function listCourseDirectories(sourceRoot: string): Promise<string[]> {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const directories: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Content Root直下にsymlinkを置けません: ${entry.name}`);
    }
    if (!entry.isDirectory()) {
      throw new Error(`Content Root直下にはCourse Directoryだけを置けます: ${entry.name}`);
    }
    if (entry.name === 'learning-paths') continue;
    directories.push(entry.name);
  }
  return directories.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** Compilerが公開するCourse文字列のSHA-256を小文字hexで返す。 */
function courseManifestSha256(course: CourseManifest): string {
  return createHash('sha256').update(stringifyCanonicalJson(course), 'utf8').digest('hex');
}

/** Course Compilation配列からintegrity付き公開Catalogをallowlist投影する。 */
function createCatalog(
  compilations: readonly CompiledCourseArtifacts[],
  learningPaths: readonly LearningPathDefinition[],
): CourseCatalog {
  return CourseCatalogSchema.parse({
    schemaVersion: 2,
    courses: compilations
      .map(({ runtime: course }) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        audience: course.audience,
        estimatedMinutes: course.estimatedMinutes,
        revision: course.revision,
        publicationStatus: course.publicationStatus,
        manifestPath: `generated/content/courses/${course.id}.json`,
        manifestSha256: courseManifestSha256(course),
        lessonStarts: course.phases.flatMap((phase) =>
          [...phase.chapters]
            .sort((left, right) => left.sequence - right.sequence)
            .flatMap((chapter) =>
              chapter.lessons.map((lesson) => ({
                lessonId: lesson.id,
                target: lessonStartTarget(lesson),
              })),
            ),
        ),
      }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
    learningPaths,
  });
}

/** 検証済みCourse Artifactだけを新規staging Rootへ書き込む。 */
async function writeCourseArtifacts(
  outputRoot: string,
  compilation: CompiledCourseArtifacts,
): Promise<void> {
  const courseId = compilation.runtime.id;
  await mkdir(resolveInside(outputRoot, 'courses'), { recursive: true });
  await writeFile(
    resolveInside(outputRoot, `courses/${courseId}.json`),
    stringifyCanonicalJson(compilation.runtime),
  );
  await writeFile(
    resolveInside(outputRoot, `courses/${courseId}.provenance.json`),
    stringifyCanonicalJson(compilation.publicProvenance),
  );
  for (const artifactPath of [...compilation.assets.keys()].sort()) {
    const bytes = compilation.assets.get(artifactPath);
    if (bytes === undefined) continue;
    const target = resolveInside(outputRoot, artifactPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

type RemoveTree = (target: string) => Promise<void>;

/** Directory treeを再帰削除する既定の公開後Cleanup処理。 */
async function removeTree(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
}

/** 2件の失敗を復旧Location付きのErrorとして保持する。 */
function createRecoveryError(
  message: string,
  primaryError: unknown,
  recoveryError: unknown,
  backupRoot: string,
): AggregateError {
  return new AggregateError(
    [primaryError, recoveryError],
    `${message} 手動復旧用Backup: ${backupRoot}`,
  );
}

/** staging完成後だけ既存Outputと差し替え、Cleanupを含む失敗時は旧Outputを復元する。 */
export async function publishStaging(
  stagingRoot: string,
  outputRoot: string,
  backupRoot: string,
  removeBackup: RemoveTree = removeTree,
): Promise<void> {
  const hadOutput = await pathExists(outputRoot);
  if (hadOutput) {
    const outputStats = await lstat(outputRoot);
    if (outputStats.isSymbolicLink() || !outputStats.isDirectory()) {
      throw new Error('既存Compiler OutputはsymlinkでないDirectoryである必要があります。');
    }
    await rename(outputRoot, backupRoot);
  }
  try {
    await rename(stagingRoot, outputRoot);
  } catch (publishError) {
    if (hadOutput && (await pathExists(backupRoot))) {
      try {
        await rename(backupRoot, outputRoot);
      } catch (recoveryError) {
        throw createRecoveryError(
          '新しい教材Outputの公開と旧Outputの自動復旧に失敗しました。',
          publishError,
          recoveryError,
          backupRoot,
        );
      }
    }
    throw publishError;
  }
  if (!hadOutput) return;

  try {
    await removeBackup(backupRoot);
  } catch (cleanupError) {
    try {
      await rename(outputRoot, stagingRoot);
      await rename(backupRoot, outputRoot);
    } catch (recoveryError) {
      if (!(await pathExists(outputRoot)) && (await pathExists(stagingRoot))) {
        try {
          await rename(stagingRoot, outputRoot);
        } catch {
          // AggregateErrorにBackup locationを残し、手動復旧可能な状態を保持する。
        }
      }
      throw createRecoveryError(
        '公開後Cleanupと旧Outputの自動復旧に失敗しました。',
        cleanupError,
        recoveryError,
        backupRoot,
      );
    }
    throw new Error('公開後Cleanupに失敗したため旧教材Outputを復元しました。', {
      cause: cleanupError,
    });
  }
}

interface CompilerLockMetadata {
  readonly token: string;
  readonly createdAt: string;
  readonly pid: number;
  readonly stagingRoot: string;
  readonly backupRoot: string;
}

/** Lock Directoryを作り、所有tokenと作成時刻を記録する。 */
async function acquireCompilerLock(
  lockRoot: string,
  token: string,
  stagingRoot: string,
  backupRoot: string,
): Promise<void> {
  try {
    await mkdir(lockRoot, { recursive: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let existingOwner = 'owner metadataなし';
    try {
      existingOwner = (await readFile(path.join(lockRoot, 'owner.json'), 'utf8')).trim();
    } catch {
      // Crash直後の空Lockも自動削除せず、既存所有権を優先する。
    }
    throw new Error(
      `別のContent Compilerが実行中です。既存Lockは自動削除しません: ${existingOwner}`,
      { cause: error },
    );
  }

  const metadata: CompilerLockMetadata = {
    token,
    createdAt: new Date().toISOString(),
    pid: process.pid,
    stagingRoot,
    backupRoot,
  };
  try {
    await writeFile(path.join(lockRoot, 'owner.json'), stringifyCanonicalJson(metadata), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    try {
      await rm(lockRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Compiler Lock初期化とCleanupに失敗しました: ${lockRoot}`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

/** 自分が作成したtokenのLockだけを解放する。 */
async function releaseCompilerLock(lockRoot: string, token: string): Promise<void> {
  const source = await readFile(path.join(lockRoot, 'owner.json'), 'utf8');
  const metadata = JSON.parse(source) as Partial<CompilerLockMetadata>;
  if (metadata.token !== token) {
    throw new Error(`Compiler Lockの所有tokenが変化したため削除しません: ${lockRoot}`);
  }
  await rm(lockRoot, { recursive: true, force: false });
}

/** Cleanup失敗を利用者向けのPath付き文字列へ変換する。 */
function cleanupWarning(label: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${label}に失敗しました: ${detail}`;
}

/** throwされたunknown値をcause付きErrorへ正規化する。 */
function toError(error: unknown, message = '未知のCompiler Errorが発生しました。'): Error {
  return error instanceof Error ? error : new Error(message, { cause: error });
}

/** 全Course directoryを決定的なCatalogとPayloadへCompileする。 */
export async function compileContent(options: CompileContentOptions): Promise<CompilationSummary> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const outputRoot = path.resolve(options.outputRoot);
  await validateCompilerRoots(sourceRoot, outputRoot);
  const courseDirectories = await listCourseDirectories(sourceRoot);
  const stagingRoot = `${outputRoot}.staging-${randomUUID()}`;
  const backupRoot = `${outputRoot}.backup-${randomUUID()}`;
  const lockRoot = `${outputRoot}.lock`;
  const lockToken = randomUUID();
  const courses: CourseManifest[] = [];
  const compilations: CompiledCourseArtifacts[] = [];
  const courseIds = new Set<string>();
  let ownsLock = false;
  let published = false;
  let summary: CompilationSummary | undefined;
  let operationError: Error | undefined;

  try {
    for (const directory of courseDirectories) {
      const compilation = await compileCourse(path.join(sourceRoot, directory));
      const course = compilation.runtime;
      if (course.id !== directory) {
        throw new Error(`Course directory名とCourse IDが一致しません: ${directory}/${course.id}`);
      }
      if (courseIds.has(course.id)) throw new Error(`Course IDが重複しています: ${course.id}`);
      courseIds.add(course.id);
      courses.push(course);
      compilations.push(compilation);
    }
    const learningPaths = await compileLearningPaths(path.join(sourceRoot, 'learning-paths'));
    const catalog = createCatalog(compilations, learningPaths);
    const catalogRoundTrip = CourseCatalogSchema.parse(
      JSON.parse(stringifyCanonicalJson(catalog)) as unknown,
    );
    if (!options.checkOnly) {
      await mkdir(path.dirname(outputRoot), { recursive: true });
      await assertNoExistingSymlinkComponents(path.dirname(outputRoot));
      await acquireCompilerLock(lockRoot, lockToken, stagingRoot, backupRoot);
      ownsLock = true;
      await mkdir(stagingRoot, { recursive: false });
      for (const compilation of compilations) {
        await writeCourseArtifacts(stagingRoot, compilation);
      }
      await writeFile(
        path.join(stagingRoot, 'catalog.json'),
        stringifyCanonicalJson(catalogRoundTrip),
      );
      await publishStaging(stagingRoot, outputRoot, backupRoot);
      published = true;
    }
    summary = { catalog: catalogRoundTrip, courseCount: courses.length, warnings: [] };
  } catch (error) {
    operationError = toError(error);
  }

  const warnings: string[] = [];
  const cleanupErrors: Error[] = [];
  if (!options.checkOnly) {
    const cleanupTasks: Array<Promise<void>> = [rm(stagingRoot, { recursive: true, force: true })];
    const cleanupLabels = ['Compiler staging Cleanup'];
    if (ownsLock) {
      cleanupTasks.push(releaseCompilerLock(lockRoot, lockToken));
      cleanupLabels.push('Compiler lock Cleanup');
    }
    const cleanupResults = await Promise.allSettled(cleanupTasks);
    cleanupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        const cleanupError = toError(result.reason, '未知のCompiler Cleanup Errorが発生しました。');
        cleanupErrors.push(cleanupError);
        warnings.push(cleanupWarning(cleanupLabels[index] ?? 'Compiler Cleanup', cleanupError));
      }
    });
  }

  if (operationError !== undefined) {
    if (warnings.length > 0) {
      throw new AggregateError(
        [operationError, ...cleanupErrors],
        'CompileとCleanupに失敗しました。',
        { cause: operationError },
      );
    }
    throw operationError;
  }
  if (summary === undefined) throw new Error('Compiler Summaryを構築できませんでした。');
  if (warnings.length > 0 && !published) {
    throw new AggregateError(cleanupErrors, '公開前のCompiler Cleanupに失敗しました。', {
      cause: cleanupErrors[0],
    });
  }
  return { ...summary, warnings };
}

/** CLI引数を検証し、Repository標準LocationをCompileする。 */
async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (
    arguments_.some((argument) => argument !== '--check') ||
    arguments_.filter((item) => item === '--check').length > 1
  ) {
    throw new Error('Usage: tsx scripts/content/compile.ts [--check]');
  }
  const checkOnly = arguments_.includes('--check');
  const summary = await compileContent({
    sourceRoot: path.resolve(process.cwd(), 'content'),
    outputRoot: path.resolve(process.cwd(), 'public/generated/content'),
    checkOnly,
  });
  console.log(
    `教材${String(summary.courseCount)} Courseを${checkOnly ? '検証' : 'Compile'}しました。`,
  );
  for (const warning of summary.warnings) console.warn(`Warning: ${warning}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
