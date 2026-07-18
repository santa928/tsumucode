/** 1 CourseのAuthoring Sourceを検証し、公開Runtime Artifactへ明示投影する。 */
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { CourseManifestSchema } from '../../src/core/content/schema';
import type {
  AssetRef,
  ChapterManifest,
  CourseManifest,
  Exercise,
  ExerciseFile,
  Lesson,
  PhaseManifest,
  Slide,
  SlideBlock,
} from '../../src/core/content/types';
import { parseRestrictedMarkdown, parseSlideMarkdown } from './markdown';
import { joinSourcePath, readBinaryFile, readUtf8File, readYamlFile } from './io';
import {
  ChapterSourceSchema,
  CourseSourceSchema,
  ExerciseSourceSchema,
  GlossarySourceSchema,
  LessonSourceSchema,
  ProvenanceSourceSchema,
  PublicProvenanceManifestSchema,
  SlideFrontmatterSchema,
  type AssetSource,
  type FileSource,
  type ProjectSource,
  type ProvenanceSource,
  type PublicProvenanceManifest,
} from './sourceSchema';

export interface AuthoringFixture {
  readonly id: string;
  readonly expectedStatus: 'pass' | 'incomplete' | 'code-error';
  readonly files: readonly ExerciseFile[];
  readonly expectedFeedbackRuleIds: readonly string[];
}

export type AuthoringExercise = Exercise & {
  readonly solutionFiles: readonly ExerciseFile[];
  readonly fixtures: readonly AuthoringFixture[];
};

export interface AuthoringCoursePackage {
  readonly runtime: CourseManifest;
  readonly exercises: readonly AuthoringExercise[];
  readonly provenance: ProvenanceSource;
}

interface CourseCompilation {
  readonly authoring: AuthoringCoursePackage;
  readonly publicProvenance: PublicProvenanceManifest;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

export interface CompiledCourseArtifacts {
  readonly runtime: CourseManifest;
  readonly publicProvenance: PublicProvenanceManifest;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

interface CompileContext {
  readonly courseId: string;
  readonly courseRoot: string;
  readonly provenanceById: ReadonlyMap<string, ProvenanceSource['items'][number]>;
  readonly provenanceByPath: ReadonlyMap<string, ProvenanceSource['items'][number]>;
  readonly provenanceFileByPath: ReadonlyMap<string, Uint8Array>;
  readonly consumedPaths: Set<string>;
  readonly assets: Map<string, Uint8Array>;
}

interface CompiledExercise {
  readonly runtime: Exercise;
  readonly authoring: AuthoringExercise;
}

interface CompiledLesson {
  readonly runtime: Lesson;
  readonly authoringExercises: readonly AuthoringExercise[];
}

interface CompiledChapter {
  readonly runtime: ChapterManifest;
  readonly authoringExercises: readonly AuthoringExercise[];
}

type RuntimeProject = Extract<Lesson, { kind: 'guided-project' }>['project'];

/** Source相対pathのowner directoryを`.`なしのPOSIX表記で返す。 */
function sourceDirectory(relativePath: string): string {
  const directory = path.posix.dirname(relativePath);
  return directory === '.' ? '' : directory;
}

/** Solution／Fixture専用Directory segmentを含むかを判定する。 */
function isAuthoringOnlyPath(relativePath: string): boolean {
  return relativePath
    .split('/')
    .some((segment) => segment === 'solution' || segment === 'fixtures');
}

/** Course tree全体を走査し、symlink／特殊Fileを拒否して通常File一覧を返す。 */
async function inspectSafeCourseTree(
  courseRoot: string,
  relativeDirectory = '',
  files: Set<string> = new Set(),
): Promise<ReadonlySet<string>> {
  const directory =
    relativeDirectory === '' ? courseRoot : path.join(courseRoot, ...relativeDirectory.split('/'));
  if (relativeDirectory === '') {
    const rootStats = await lstat(directory);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      throw new Error('Course RootはsymlinkでないDirectoryである必要があります。');
    }
  }
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  for (const entry of entries) {
    const relativePath =
      relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`Course treeにsymlinkは使用できません: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await inspectSafeCourseTree(courseRoot, relativePath, files);
    } else if (!entry.isFile()) {
      throw new Error(`Course treeには通常FileとDirectoryだけを置けます: ${relativePath}`);
    } else {
      files.add(relativePath);
    }
  }
  return files;
}

/** Source fileが公開／Solution／Fixtureの役割に合うDirectoryへ置かれていることを確認する。 */
function assertFileRole(relativePath: string, role: 'public' | 'solution' | 'fixture'): void {
  const segments = relativePath.split('/');
  if (role === 'public' && isAuthoringOnlyPath(relativePath)) {
    throw new Error(`公開SourceをSolution／Fixture Directoryから読めません: ${relativePath}`);
  }
  if (role === 'solution' && !segments.includes('solution')) {
    throw new Error(`Solution Sourceはsolution Directoryへ置いてください: ${relativePath}`);
  }
  if (role === 'fixture' && !segments.includes('fixtures')) {
    throw new Error(`Fixture Sourceはfixtures Directoryへ置いてください: ${relativePath}`);
  }
}

/** 2つのbyte列が同一かを比較する。 */
function hasSameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** JSON objectのkeyだけを再帰的にASCII順へ整列し、配列順を保持する。 */
function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('公開JSONへ非finite numberを含められません。');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value !== 'object') throw new Error('公開JSONへJSON化できない値を含められません。');
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) result[key] = canonicalizeJson(child);
  }
  return result;
}

/** 公開Artifactをrecursive key sort、LF、末尾改行1件のJSONへ変換する。 */
export function stringifyCanonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalizeJson(value), null, 2)}\n`;
}

/** Full Provenanceの一意性、実File、visibility、image-generation promptを検証する。 */
async function validateProvenance(
  courseRoot: string,
  provenance: ProvenanceSource,
): Promise<{
  readonly byId: ReadonlyMap<string, ProvenanceSource['items'][number]>;
  readonly byPath: ReadonlyMap<string, ProvenanceSource['items'][number]>;
  readonly fileByPath: ReadonlyMap<string, Uint8Array>;
}> {
  const byId = new Map<string, ProvenanceSource['items'][number]>();
  const byPath = new Map<string, ProvenanceSource['items'][number]>();
  const fileByPath = new Map<string, Uint8Array>();

  for (const item of provenance.items) {
    if (byId.has(item.id)) throw new Error(`Provenance IDが重複しています: ${item.id}`);
    if (byPath.has(item.path)) throw new Error(`Provenance pathが重複しています: ${item.path}`);
    if (item.visibility === 'public' && isAuthoringOnlyPath(item.path)) {
      throw new Error(`Public Provenanceへauthoring pathを指定できません: ${item.id}/${item.path}`);
    }
    const method = item.method ?? provenance.defaults.method;
    if (method === 'image-generation' && item.promptPath === undefined) {
      throw new Error(`Image Generation ProvenanceにpromptPathが必要です: ${item.id}`);
    }
    byId.set(item.id, item);
    byPath.set(item.path, item);
    fileByPath.set(item.path, await readBinaryFile(courseRoot, item.path));
    if (item.promptPath !== undefined && !fileByPath.has(item.promptPath)) {
      fileByPath.set(item.promptPath, await readBinaryFile(courseRoot, item.promptPath));
    }
  }
  return { byId, byPath, fileByPath };
}

/** Full Provenanceからauthoring-only fieldを除いたpublic Manifestを投影する。 */
function createPublicProvenance(provenance: ProvenanceSource): PublicProvenanceManifest {
  const items = provenance.items
    .filter((item) => item.visibility === 'public')
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((item) => ({
      id: item.id,
      visibility: 'public' as const,
      path: item.path,
      ...(item.method === undefined ? {} : { method: item.method }),
      ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
      ...(item.creator === undefined ? {} : { creator: item.creator }),
      ...(item.sourceUrl === undefined ? {} : { sourceUrl: item.sourceUrl }),
      ...(item.license === undefined ? {} : { license: item.license }),
      ...(item.modified === undefined ? {} : { modified: item.modified }),
    }));
  return PublicProvenanceManifestSchema.parse({
    schemaVersion: provenance.schemaVersion,
    defaults: {
      method: provenance.defaults.method,
      createdAt: provenance.defaults.createdAt,
      creator: provenance.defaults.creator,
      sourceUrl: provenance.defaults.sourceUrl,
      license: provenance.defaults.license,
      modified: provenance.defaults.modified,
    },
    items,
  });
}

/** owner内AssetをProvenanceへjoinし、検証済みBufferとRuntime参照へ変換する。 */
async function compileAssets(
  ownerDirectory: string,
  sources: readonly AssetSource[],
  context: CompileContext,
): Promise<AssetRef[]> {
  const assets: AssetRef[] = [];
  for (const asset of sources) {
    const sourcePath = joinSourcePath(ownerDirectory, asset.source);
    assertFileRole(sourcePath, 'public');
    context.consumedPaths.add(sourcePath);
    const provenance = context.provenanceById.get(asset.provenanceId);
    if (provenance === undefined) {
      throw new Error(`AssetのProvenance IDがありません: ${asset.id}/${asset.provenanceId}`);
    }
    if (provenance.visibility !== 'public') {
      throw new Error(`公開Assetがauthoring Provenanceを参照しています: ${asset.id}`);
    }
    if (provenance.path !== sourcePath) {
      throw new Error(`Asset SourceとProvenance pathが一致しません: ${asset.id}`);
    }
    const sourceBytes = context.provenanceFileByPath.get(sourcePath);
    if (sourceBytes === undefined) {
      throw new Error(`Assetの検証済みSource Bufferがありません: ${asset.id}`);
    }
    const extension = path.posix.extname(sourcePath).toLowerCase();
    if (extension.length === 0) throw new Error(`Asset Sourceに拡張子がありません: ${asset.id}`);
    const artifactPath = `assets/${context.courseId}/${asset.id}${extension}`;
    const previous = context.assets.get(artifactPath);
    if (previous !== undefined && !hasSameBytes(previous, sourceBytes)) {
      throw new Error(`同じAsset出力先へ異なるbytesを公開できません: ${artifactPath}`);
    }
    context.assets.set(artifactPath, sourceBytes);
    assets.push({
      id: asset.id,
      path: `generated/content/${artifactPath}`,
      mediaType: asset.mediaType,
      ...(asset.alt === undefined ? {} : { alt: asset.alt }),
      provenanceId: asset.provenanceId,
    });
  }
  return assets;
}

/** Markdown Slide Sourceを公開Slideへ変換する。 */
async function compileSlide(relativePath: string, context: CompileContext): Promise<Slide> {
  assertFileRole(relativePath, 'public');
  context.consumedPaths.add(relativePath);
  const parsed = parseSlideMarkdown(await readUtf8File(context.courseRoot, relativePath));
  const metadata = SlideFrontmatterSchema.parse(parsed.frontmatter);
  return {
    id: metadata.id,
    title: metadata.title,
    kind: metadata.kind,
    ...(metadata.concept === undefined ? {} : { concept: metadata.concept }),
    blocks: parsed.blocks,
    assets: await compileAssets(sourceDirectory(relativePath), metadata.assets, context),
  };
}

/** Exercise用File Sourceを同一内容のAuthoring／Runtime Fileへ変換する。 */
async function compileFile(
  ownerDirectory: string,
  source: FileSource,
  context: CompileContext,
  role: 'public' | 'solution' | 'fixture',
): Promise<ExerciseFile> {
  const sourcePath = joinSourcePath(ownerDirectory, source.source);
  assertFileRole(sourcePath, role);
  context.consumedPaths.add(sourcePath);
  if (role !== 'public') {
    const provenance = context.provenanceByPath.get(sourcePath);
    if (provenance === undefined || provenance.visibility !== 'authoring') {
      throw new Error(`Solution／Fixture Fileにauthoring Provenanceが必要です: ${sourcePath}`);
    }
  }
  return {
    path: source.path,
    language: source.language,
    content: await readUtf8File(context.courseRoot, sourcePath),
    editable: source.editable,
  };
}

/** Authoring Exerciseから公開許可fieldだけを明示投影する。 */
function projectRuntimeExercise(authoring: AuthoringExercise): Exercise {
  const common = {
    id: authoring.id,
    workspaceId: authoring.workspaceId,
    countsTowardStandardExerciseTotal: authoring.countsTowardStandardExerciseTotal,
    title: authoring.title,
    instructions: authoring.instructions,
    files: authoring.files,
    validationRules: authoring.validationRules,
    hints: authoring.hints,
    relatedSlideIds: authoring.relatedSlideIds,
    previewViewports: authoring.previewViewports,
    assets: authoring.assets,
  };
  if (authoring.kind === 'standard') return { ...common, kind: 'standard' };
  if (authoring.kind === 'guided-project') {
    return { ...common, kind: 'guided-project', projectId: authoring.projectId };
  }
  return { ...common, kind: 'capstone', projectId: authoring.projectId };
}

/** Exercise YAMLと全Starter／Solution／Fixtureを同じ経路で読み込む。 */
async function compileExercise(
  relativePath: string,
  context: CompileContext,
): Promise<CompiledExercise> {
  assertFileRole(relativePath, 'public');
  context.consumedPaths.add(relativePath);
  const source = await readYamlFile(context.courseRoot, relativePath, ExerciseSourceSchema);
  const directory = sourceDirectory(relativePath);
  const instructionsPath = joinSourcePath(directory, source.instructionsSource);
  assertFileRole(instructionsPath, 'public');
  context.consumedPaths.add(instructionsPath);
  const instructions = parseRestrictedMarkdown(
    await readUtf8File(context.courseRoot, instructionsPath),
  );
  const files: ExerciseFile[] = [];
  for (const file of source.files)
    files.push(await compileFile(directory, file, context, 'public'));
  const solutionFiles: ExerciseFile[] = [];
  for (const file of source.solutionFiles) {
    solutionFiles.push(await compileFile(directory, file, context, 'solution'));
  }
  const fixtures: AuthoringFixture[] = [];
  for (const fixture of source.fixtures) {
    const fixtureFiles: ExerciseFile[] = [];
    for (const file of fixture.files) {
      fixtureFiles.push(await compileFile(directory, file, context, 'fixture'));
    }
    fixtures.push({
      id: fixture.id,
      expectedStatus: fixture.expectedStatus,
      files: fixtureFiles,
      expectedFeedbackRuleIds: fixture.expectedFeedbackRuleIds,
    });
  }
  const common = {
    id: source.id,
    workspaceId: source.workspaceId,
    countsTowardStandardExerciseTotal: source.countsTowardStandardExerciseTotal,
    title: source.title,
    instructions,
    files,
    validationRules: source.validationRules,
    hints: source.hints,
    relatedSlideIds: source.relatedSlideIds,
    previewViewports: source.previewViewports,
    assets: await compileAssets(directory, source.assets, context),
    solutionFiles,
    fixtures,
  };

  let authoring: AuthoringExercise;
  if (source.kind === 'standard') {
    authoring = { ...common, kind: 'standard' };
  } else if (source.kind === 'guided-project') {
    authoring = { ...common, kind: 'guided-project', projectId: source.projectId };
  } else {
    authoring = { ...common, kind: 'capstone', projectId: source.projectId };
  }
  return { authoring, runtime: projectRuntimeExercise(authoring) };
}

/** Projectのbrief／guide MarkdownをAssetなしBlockへ変換する。 */
async function compileProject(
  source: ProjectSource,
  ownerDirectory: string,
  context: CompileContext,
): Promise<RuntimeProject> {
  const briefPath = joinSourcePath(ownerDirectory, source.briefSource);
  assertFileRole(briefPath, 'public');
  context.consumedPaths.add(briefPath);
  const brief = parseRestrictedMarkdown(await readUtf8File(context.courseRoot, briefPath));
  const guide: SlideBlock[] = [];
  for (const guideSource of source.guideSources) {
    const guidePath = joinSourcePath(ownerDirectory, guideSource);
    assertFileRole(guidePath, 'public');
    context.consumedPaths.add(guidePath);
    guide.push(...parseRestrictedMarkdown(await readUtf8File(context.courseRoot, guidePath)));
  }
  return { id: source.id, brief, guide, checklist: source.checklist };
}

/** Lesson YAML配下のSlide／Exercise／Projectを公開LessonへCompileする。 */
async function compileLesson(
  relativePath: string,
  context: CompileContext,
): Promise<CompiledLesson> {
  assertFileRole(relativePath, 'public');
  context.consumedPaths.add(relativePath);
  const source = await readYamlFile(context.courseRoot, relativePath, LessonSourceSchema);
  const directory = sourceDirectory(relativePath);
  const slides: Slide[] = [];
  for (const slideSource of source.slideSources) {
    slides.push(await compileSlide(joinSourcePath(directory, slideSource), context));
  }
  const exercises: Exercise[] = [];
  const authoringExercises: AuthoringExercise[] = [];
  for (const exerciseSource of source.exerciseSources) {
    const compiled = await compileExercise(joinSourcePath(directory, exerciseSource), context);
    exercises.push(compiled.runtime);
    authoringExercises.push(compiled.authoring);
  }
  const common = {
    id: source.id,
    title: source.title,
    goal: source.goal,
    estimatedMinutes: source.estimatedMinutes,
    prerequisiteLessonIds: source.prerequisiteLessonIds,
    slides,
    exercises,
    reflection: source.reflection,
    glossaryRefs: source.glossaryRefs,
    ...(source.nextLessonId === undefined ? {} : { nextLessonId: source.nextLessonId }),
  };

  let runtime: Lesson;
  if (source.kind === 'standard') {
    runtime = { ...common, kind: 'standard', completion: source.completion };
  } else if (source.kind === 'guided-project') {
    runtime = {
      ...common,
      kind: 'guided-project',
      project: await compileProject(source.project, directory, context),
      completion: source.completion,
    };
  } else {
    runtime = {
      ...common,
      kind: 'capstone',
      project: await compileProject(source.project, directory, context),
      completion: source.completion,
    };
  }
  return { runtime, authoringExercises };
}

/** Chapter YAML配下のLessonを公開ChapterへCompileする。 */
async function compileChapter(
  relativePath: string,
  context: CompileContext,
): Promise<CompiledChapter> {
  assertFileRole(relativePath, 'public');
  context.consumedPaths.add(relativePath);
  const source = await readYamlFile(context.courseRoot, relativePath, ChapterSourceSchema);
  const directory = sourceDirectory(relativePath);
  const lessons: Lesson[] = [];
  const authoringExercises: AuthoringExercise[] = [];
  for (const lessonSource of source.lessonSources) {
    const compiled = await compileLesson(joinSourcePath(directory, lessonSource), context);
    lessons.push(compiled.runtime);
    authoringExercises.push(...compiled.authoringExercises);
  }
  return {
    runtime: {
      id: source.id,
      sequence: source.sequence,
      title: source.title,
      goal: source.goal,
      estimatedMinutes: source.estimatedMinutes,
      kind: source.kind,
      lessons,
    },
    authoringExercises,
  };
}

/** 公開Course／Provenanceにauthoring-only field／path／IDが残らないことを確認する。 */
function assertNoAuthoringLeak(
  runtime: CourseManifest,
  publicProvenance: PublicProvenanceManifest,
  fullProvenance: ProvenanceSource,
): void {
  const forbiddenKeys = new Set(['solutionFiles', 'fixtures', 'promptPath']);
  const authoringIds = new Set(
    fullProvenance.items.filter((item) => item.visibility === 'authoring').map((item) => item.id),
  );

  /** 公開objectを再帰走査し、authoring専用の構造参照だけを検出する。 */
  function inspect(value: unknown, ownerKey?: string): void {
    if (typeof value === 'string') {
      if (
        ownerKey !== undefined &&
        /(?:path|source)$/iu.test(ownerKey) &&
        isAuthoringOnlyPath(value)
      ) {
        throw new Error(`公開ArtifactへSolution／Fixture pathが残っています: ${value}`);
      }
      if (ownerKey === 'provenanceId' && authoringIds.has(value)) {
        throw new Error(`公開Artifactへauthoring Provenance IDが残っています: ${value}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) inspect(child, ownerKey);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) {
        throw new Error(`公開Artifactへauthoring-only fieldが残っています: ${key}`);
      }
      inspect(child, key);
    }
  }

  inspect(runtime);
  inspect(publicProvenance);
}

/** Provenance itemとCourse内通常Fileが教材Hierarchyから意味的に参照されることを確認する。 */
function assertAllSourceFilesConsumed(
  courseFiles: ReadonlySet<string>,
  consumedPaths: ReadonlySet<string>,
  provenance: ProvenanceSource,
): void {
  for (const item of provenance.items) {
    if (!consumedPaths.has(item.path)) {
      throw new Error(`Provenance itemが教材Hierarchyから未参照です: ${item.id}/${item.path}`);
    }
  }
  for (const filePath of courseFiles) {
    if (!consumedPaths.has(filePath)) {
      throw new Error(`Course treeに未参照Fileがあります: ${filePath}`);
    }
  }
}

/** 1 Courseを副作用なしでAuthoring Packageと公開Artifactへ構築する。 */
async function buildCourseCompilation(courseRoot: string): Promise<CourseCompilation> {
  const resolvedCourseRoot = path.resolve(courseRoot);
  const courseFiles = await inspectSafeCourseTree(resolvedCourseRoot);
  const consumedPaths = new Set<string>(['course.yaml']);
  const source = await readYamlFile(resolvedCourseRoot, 'course.yaml', CourseSourceSchema);
  assertFileRole(source.provenanceManifestPath, 'public');
  consumedPaths.add(source.provenanceManifestPath);
  const provenance = await readYamlFile(
    resolvedCourseRoot,
    source.provenanceManifestPath,
    ProvenanceSourceSchema,
  );
  const validatedProvenance = await validateProvenance(resolvedCourseRoot, provenance);
  for (const item of provenance.items) {
    if (item.promptPath !== undefined) consumedPaths.add(item.promptPath);
  }
  const context: CompileContext = {
    courseId: source.id,
    courseRoot: resolvedCourseRoot,
    provenanceById: validatedProvenance.byId,
    provenanceByPath: validatedProvenance.byPath,
    provenanceFileByPath: validatedProvenance.fileByPath,
    consumedPaths,
    assets: new Map(),
  };
  for (const documentationSource of source.documentationSources) {
    assertFileRole(documentationSource, 'public');
    const provenanceItem = validatedProvenance.byPath.get(documentationSource);
    if (provenanceItem === undefined || provenanceItem.visibility !== 'public') {
      throw new Error(`制作Documentにpublic Provenanceが必要です: ${documentationSource}`);
    }
    consumedPaths.add(documentationSource);
  }
  for (const authoringSource of source.authoringSources) {
    assertFileRole(authoringSource, 'public');
    const provenanceItem = validatedProvenance.byPath.get(authoringSource);
    if (provenanceItem === undefined || provenanceItem.visibility !== 'authoring') {
      throw new Error(
        `Course級Authoring Sourceにauthoring Provenanceが必要です: ${authoringSource}`,
      );
    }
    consumedPaths.add(authoringSource);
  }
  assertFileRole(source.glossarySource, 'public');
  consumedPaths.add(source.glossarySource);
  const glossary = await readYamlFile(
    resolvedCourseRoot,
    source.glossarySource,
    GlossarySourceSchema,
  );
  const phases: PhaseManifest[] = [];
  const authoringExercises: AuthoringExercise[] = [];
  for (const phaseSource of source.phases) {
    const chapters: ChapterManifest[] = [];
    for (const chapterSource of phaseSource.chapterSources) {
      const compiled = await compileChapter(chapterSource, context);
      chapters.push(compiled.runtime);
      authoringExercises.push(...compiled.authoringExercises);
    }
    phases.push({
      id: phaseSource.id,
      title: phaseSource.title,
      description: phaseSource.description,
      chapters,
    });
  }
  const provenanceManifestPath = `generated/content/courses/${source.id}.provenance.json`;
  const runtime = CourseManifestSchema.parse({
    schemaVersion: source.schemaVersion,
    id: source.id,
    title: source.title,
    description: source.description,
    audience: source.audience,
    estimatedMinutes: source.estimatedMinutes,
    revision: source.revision,
    runnerId: source.runnerId,
    validatorId: source.validatorId,
    glossary: glossary.entries,
    supportedDevices: source.supportedDevices,
    prerequisites: source.prerequisites,
    publicationStatus: source.publicationStatus,
    expectedTotals: source.expectedTotals,
    provenanceManifestPath,
    progressMigrations: source.progressMigrations,
    phases,
  });
  const publicProvenance = createPublicProvenance(provenance);

  const runtimeRoundTrip = CourseManifestSchema.parse(
    JSON.parse(stringifyCanonicalJson(runtime)) as unknown,
  );
  const provenanceRoundTrip = PublicProvenanceManifestSchema.parse(
    JSON.parse(stringifyCanonicalJson(publicProvenance)) as unknown,
  );
  assertNoAuthoringLeak(runtimeRoundTrip, provenanceRoundTrip, provenance);
  assertAllSourceFilesConsumed(courseFiles, consumedPaths, provenance);
  return {
    authoring: {
      runtime: runtimeRoundTrip,
      exercises: authoringExercises,
      provenance,
    },
    publicProvenance: provenanceRoundTrip,
    assets: context.assets,
  };
}

/** Test専用にFull ProvenanceとSolution／Fixtureを含むPackageを副作用なしで読む。 */
export async function loadAuthoringCourse(courseRoot: string): Promise<AuthoringCoursePackage> {
  return (await buildCourseCompilation(courseRoot)).authoring;
}

/** 1 Course directoryを副作用なしの検証済み公開Artifactへ変換する。 */
export async function compileCourse(courseRoot: string): Promise<CompiledCourseArtifacts> {
  const compilation = await buildCourseCompilation(courseRoot);
  return {
    runtime: compilation.authoring.runtime,
    publicProvenance: compilation.publicProvenance,
    assets: compilation.assets,
  };
}
