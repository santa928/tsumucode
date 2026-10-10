import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { CommitShaSchema, Sha256Schema } from './releaseSchema';

const execFileAsync = promisify(execFile);
const COURSE_PATH = 'content/next/course.yaml';
const FRONTEND_PATH = 'content/learning-paths/frontend.yaml';
const HISTORY_PATH = 'content/next/release-history.yaml';
const ROOT_INPUTS = new Set([
  'package.json',
  'package-lock.json',
  'index.html',
  'Dockerfile',
  'Dockerfile.learning',
  'compose.yaml',
  'compose.learning.yaml',
  'compose.override.yaml',
  'compose.yml',
  'compose.override.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
  'docker-compose.override.yaml',
  'docker-compose.override.yml',
  '.dockerignore',
  '.env',
  '.env.sample',
  '.npmrc',
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.bundle.config.ts',
  'playwright.config.ts',
  'playwright.local.config.ts',
  'playwright.performance.config.ts',
  'lighthouserc.cjs',
  'eslint.config.js',
  'prettier.config.mjs',
  '.prettierignore',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
]);

export const NextInputManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: z.literal('next'),
    sourceCommit: CommitShaSchema,
    scope: z.literal('next-learning-input-v1'),
    publicationMetadata: z
      .object({
        coursePublicationStatus: z.enum(['draft', 'published']),
        frontendNextRequired: z.boolean(),
      })
      .strict(),
    entries: z.array(
      z
        .object({
          path: z.string().min(1),
          rawSha256: Sha256Schema,
          normalizedSha256: Sha256Schema,
          normalizedBytes: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    normalizedInputSha256: Sha256Schema,
  })
  .strict();
export type NextInputManifest = z.infer<typeof NextInputManifestSchema>;

/** 入力scopeは固定する。生成教材と承認履歴だけを除き、新しい学習fileも自動で含める。 */
export function isNextLearningInput(relative: string): boolean {
  if (relative === HISTORY_PATH) return false;
  return (
    ROOT_INPUTS.has(relative) ||
    relative.startsWith('src/') ||
    relative.startsWith('scripts/') ||
    relative.startsWith('tests/') ||
    relative.startsWith('.github/workflows/') ||
    (relative.startsWith('content/') && !relative.endsWith('/release-history.yaml')) ||
    relative.startsWith('content/learning-paths/') ||
    (relative.startsWith('public/') && !relative.startsWith('public/generated/content/'))
  );
}

/** Unicode文字列をUTF-8 byteとしてSHA-256へ固定する。 */
function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Next公開登録のexact byte blockだけを除去する。他Step/順序/コメントは正規化しない。 */
function normalizeFrontend(source: string): string {
  const value = parse(source) as unknown;
  const document = z
    .object({
      schemaVersion: z.literal(1),
      id: z.literal('frontend'),
      title: z.string(),
      description: z.string(),
      publicationStatus: z.literal('published'),
      steps: z.array(
        z
          .object({
            courseId: z.string(),
            role: z.string(),
            prerequisiteCourseIds: z.array(z.string()),
          })
          .strict(),
      ),
    })
    .strict()
    .parse(value);
  const nextSteps = document.steps.filter(({ courseId }) => courseId === 'next');
  if (nextSteps.length === 0) {
    if (
      document.steps.length !== 4 ||
      document.steps[0]?.courseId !== 'html-css' ||
      document.steps[1]?.courseId !== 'javascript' ||
      document.steps[2]?.courseId !== 'typescript' ||
      document.steps[3]?.courseId !== 'react'
    )
      throw new Error(
        'Next追加前の公開PathはHTML/CSS→JavaScript→TypeScript→Reactである必要があります',
      );
    return source;
  }
  if (
    nextSteps.length !== 1 ||
    document.steps.length !== 5 ||
    document.steps[0]?.courseId !== 'html-css' ||
    document.steps[1]?.courseId !== 'javascript' ||
    document.steps[2]?.courseId !== 'typescript' ||
    document.steps[3]?.courseId !== 'react' ||
    document.steps[4]?.courseId !== 'next' ||
    nextSteps[0]?.role !== 'required' ||
    JSON.stringify(nextSteps[0].prerequisiteCourseIds) !== '["react"]'
  )
    throw new Error('frontendへのNext登録はReact直後のrequired/[react]だけを許可します');
  const registration =
    /^ {2}- courseId: next\r?\n {4}role: required\r?\n {4}prerequisiteCourseIds: \[react\](?:\r?\n|$)/gmu;
  const matches = [...source.matchAll(registration)];
  if (matches.length !== 1)
    throw new Error('Next登録のbyte形式が固定公開metadata契約と一致しません');
  return source.replace(registration, '');
}

/** 唯一許可した公開metadataだけを正規化し、教材/移行/UI等の変更を保持する。 */
function normalizedBytes(relative: string, bytes: Uint8Array): Uint8Array {
  if (relative !== COURSE_PATH && relative !== FRONTEND_PATH) return bytes;
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (relative === FRONTEND_PATH) return new TextEncoder().encode(normalizeFrontend(source));
  const matches = [...source.matchAll(/^publicationStatus: (draft|published)$/gmu)];
  if (matches.length !== 1)
    throw new Error('Next CourseのpublicationStatusが一意な固定形式ではありません');
  return new TextEncoder().encode(
    source.replace(/^publicationStatus: (draft|published)$/gmu, 'publicationStatus: draft'),
  );
}

/** 呼び出し元から受けた全固定scope fileをmanifest化する。任意の除外引数を提供しない。 */
export function createNextInputManifest(
  sourceCommit: string,
  files: ReadonlyMap<string, Uint8Array>,
): NextInputManifest {
  CommitShaSchema.parse(sourceCommit);
  for (const required of [COURSE_PATH, FRONTEND_PATH, 'package.json', 'package-lock.json']) {
    if (!files.has(required)) throw new Error(`必須学習入力がありません: ${required}`);
  }
  const courseSource = new TextDecoder('utf-8', { fatal: true }).decode(files.get(COURSE_PATH));
  const course = z
    .looseObject({ id: z.literal('next'), publicationStatus: z.enum(['draft', 'published']) })
    .parse(parse(courseSource));
  const frontendSource = new TextDecoder('utf-8', { fatal: true }).decode(files.get(FRONTEND_PATH));
  const frontendNextRequired = normalizeFrontend(frontendSource) !== frontendSource;
  const entries = [...files]
    .filter(([relative]) => isNextLearningInput(relative))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([relative, bytes]) => {
      if (
        relative.split('/').some((part) => part === '' || part === '.' || part === '..') ||
        relative.includes('\\') ||
        relative.startsWith('/')
      )
        throw new Error('学習入力pathが不正です');
      const normalized = normalizedBytes(relative, bytes);
      return {
        path: relative,
        rawSha256: digest(bytes),
        normalizedSha256: digest(normalized),
        normalizedBytes: normalized.byteLength,
      };
    });
  const normalizedInputSha256 = digest(
    JSON.stringify(
      entries.map(({ path, normalizedSha256, normalizedBytes }) => ({
        path,
        normalizedSha256,
        normalizedBytes,
      })),
    ),
  );
  return NextInputManifestSchema.parse({
    schemaVersion: 1,
    courseId: 'next',
    sourceCommit,
    scope: 'next-learning-input-v1',
    publicationMetadata: {
      coursePublicationStatus: course.publicationStatus,
      frontendNextRequired,
    },
    entries,
    normalizedInputSha256,
  });
}

/** 正規化manifestを再計算し、payload内部hashや並びの差し替えを拒否する。 */
function validateManifest(input: NextInputManifest): NextInputManifest {
  const manifest = NextInputManifestSchema.parse(input);
  const paths = manifest.entries.map(({ path }) => path);
  if (
    ![COURSE_PATH, FRONTEND_PATH, 'package.json', 'package-lock.json'].every((relative) =>
      paths.includes(relative),
    )
  ) {
    throw new Error('学習入力manifestの必須fileがありません');
  }
  if (
    new Set(paths).size !== paths.length ||
    paths.some(
      (relative, index) =>
        !isNextLearningInput(relative) || (index > 0 && relative <= (paths[index - 1] ?? '')),
    )
  ) {
    throw new Error('学習入力manifestのscope/unique/path順序が不正です');
  }
  const actual = digest(
    JSON.stringify(
      manifest.entries.map(({ path, normalizedSha256, normalizedBytes }) => ({
        path,
        normalizedSha256,
        normalizedBytes,
      })),
    ),
  );
  if (actual !== manifest.normalizedInputSha256)
    throw new Error('学習入力manifest内部hashが不一致です');
  return manifest;
}

/** SとPの学習入力を照合する。metadata以外の差異はaffected再検証を要求して拒否する。 */
export function compareNextLearningInputs(
  draftInput: NextInputManifest,
  finalInput: NextInputManifest,
): readonly string[] {
  const draft = validateManifest(draftInput);
  const final = validateManifest(finalInput);
  if (
    draft.publicationMetadata.coursePublicationStatus !== 'draft' ||
    draft.publicationMetadata.frontendNextRequired ||
    final.publicationMetadata.coursePublicationStatus !== 'published' ||
    !final.publicationMetadata.frontendNextRequired
  ) {
    throw new Error('SのdraftからPのpublished/required登録への遷移ではありません');
  }
  if (draft.normalizedInputSha256 !== final.normalizedInputSha256) {
    throw new Error('draft/finalの学習入力が変更されています。affected後続/全通し再検証が必要です');
  }
  const changed = final.entries
    .filter((entry, index) => entry.rawSha256 !== draft.entries[index]?.rawSha256)
    .map(({ path }) => path);
  if (changed.some((relative) => relative !== COURSE_PATH && relative !== FRONTEND_PATH)) {
    throw new Error('公開metadata以外のraw入力が変更されています');
  }
  return changed;
}

/** Git固定commitの通常blob全scopeを読む。symlink/submodule/欠落を入力承認へ使用しない。 */
export async function readNextLearningInput(
  repositoryRoot: string,
  sourceCommit: string,
): Promise<NextInputManifest> {
  CommitShaSchema.parse(sourceCommit);
  const { stdout } = await execFileAsync('git', ['ls-tree', '-r', '-z', sourceCommit], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const files = new Map<string, Uint8Array>();
  for (const row of stdout.split('\0').filter(Boolean)) {
    const separator = row.indexOf('\t');
    const relative = row.slice(separator + 1);
    if (!isNextLearningInput(relative)) continue;
    if (separator < 0 || !/^100(?:644|755) blob [a-f0-9]{40}$/u.test(row.slice(0, separator))) {
      throw new Error(`学習入力は通常Git blobだけを許可します: ${relative}`);
    }
    const result = await execFileAsync('git', ['show', `${sourceCommit}:${relative}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      maxBuffer: 32 * 1024 * 1024,
    });
    files.set(relative, result.stdout);
  }
  return createNextInputManifest(sourceCommit, files);
}

/** 明示した固定commitの入力manifestだけを保存する。既存原本を上書きしない。 */
async function main(arguments_: readonly string[]): Promise<void> {
  const required = (flag: string): string => {
    const index = arguments_.indexOf(flag);
    const value = index < 0 ? undefined : arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag}へ値が必要です`);
    return value;
  };
  const manifest = await readNextLearningInput(process.cwd(), required('--source-sha'));
  await writeFile(required('--output'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(`Next learning input: ${manifest.sourceCommit} ${manifest.normalizedInputSha256}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
