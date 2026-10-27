import { lstat, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { readDraftCandidateGit } from './draftQualityInputHashes';
import { sha256Bytes, sha256Text } from './releaseHashes';
import { CommitShaSchema } from './releaseSchema';

const COURSE_PATH = 'content/tailwind/course.yaml';
const execFileAsync = promisify(execFile);
const PROVENANCE_PATH = 'content/tailwind/provenance.yaml';
const FRONTEND_PATH = 'content/learning-paths/frontend.yaml';
const REGISTRATION =
  '  - courseId: tailwind\n    role: recommended\n    prerequisiteCourseIds: [html-css]\n';
const REQUIRED_COURSES = ['html-css', 'javascript', 'typescript', 'react', 'next'];
const ROOT_INPUTS = new Set([
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.ts',
  'Dockerfile',
  'Dockerfile.learning',
  'compose.yaml',
  'compose.learning.yaml',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
]);

/** Tailwindの任意登録だけを許可し、後続requiredへの前提追加と順序変更を拒否する。 */
export function normalizeTailwindFrontend(source: string): string {
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
            role: z.enum(['required', 'recommended']),
            prerequisiteCourseIds: z.array(z.string()),
          })
          .strict(),
      ),
    })
    .strict()
    .parse(parse(source));
  const tailwind = document.steps.filter(({ courseId }) => courseId === 'tailwind');
  const required = document.steps.filter(({ courseId }) => courseId !== 'tailwind');
  if (
    canonicalJson(required.map(({ courseId }) => courseId)) !== canonicalJson(REQUIRED_COURSES) ||
    required.some(
      (step, index) =>
        step.role !== 'required' ||
        canonicalJson(step.prerequisiteCourseIds) !==
          canonicalJson(index === 0 ? [] : [REQUIRED_COURSES[index - 1]]),
    ) ||
    tailwind.length > 1
  )
    throw new Error('Tailwind追加は既存required Courseと前提条件を変更できません');
  if (tailwind.length === 0) return source;
  const step = tailwind[0]!;
  if (
    document.steps[1] !== step ||
    step.role !== 'recommended' ||
    canonicalJson(step.prerequisiteCourseIds) !== '["html-css"]' ||
    source.split(REGISTRATION).length !== 2
  )
    throw new Error('TailwindはHTML/CSS直後のrecommended/[html-css]だけを許可します');
  return source.replace(REGISTRATION, '');
}

/** 固定台帳のauthoring登録・公開状態・草稿表記だけを正規化する。教材やrevisionは保持する。 */
export function normalizeTailwindPublicationFile(relative: string, source: string): string {
  if (relative === FRONTEND_PATH) return normalizeTailwindFrontend(source);
  if (relative === PROVENANCE_PATH)
    return source.replace(
      '  - id: tailwind-release-history-authoring\n    visibility: authoring\n    path: release-history.yaml\n',
      '',
    );
  if (relative !== COURSE_PATH) return source;
  if ([...source.matchAll(/^publicationStatus: (draft|published)$/gmu)].length !== 1)
    throw new Error('Tailwind公開状態は一意な固定形式が必要です');
  return source
    .replace(/^authoringSources:\n  - release-history.yaml$/mu, 'authoringSources: []')
    .replace(/^publicationStatus: (draft|published)$/gmu, 'publicationStatus: draft')
    .replace(
      /^description: CSSと対応させ、Utility・操作状態・幅の条件からテーマと制作へつなぐ5レッスン。$/mu,
      'description: CSSと対応させ、Utility・操作状態・幅の条件からテーマと制作へつなぐ草稿5レッスン。',
    );
}

/** 草稿受入に使った教材・実行・画面・配布入力を固定する。公開台帳やGate実装は別に審査する。 */
export function isTailwindPublicationInput(relative: string): boolean {
  return (
    ROOT_INPUTS.has(relative) ||
    relative === FRONTEND_PATH ||
    (relative.startsWith('content/tailwind/') && !relative.endsWith('/release-history.yaml')) ||
    relative.startsWith('src/') ||
    relative.startsWith('scripts/content/') ||
    relative.startsWith('scripts/build/') ||
    relative.startsWith('scripts/local/') ||
    relative === 'scripts/inline-production-css.ts' ||
    relative.startsWith('vendor/') ||
    (relative.startsWith('public/') && !relative.startsWith('public/generated/'))
  );
}

/** 元Sourceの実bytesを読む。現在fileも比較し、commit前の入力変更を見逃さない。 */
export async function hashTailwindPublicationInputs(
  root: string,
  sourceCommit?: string,
): Promise<string> {
  const commit = sourceCommit === undefined ? undefined : CommitShaSchema.parse(sourceCommit);
  const listed = await readDraftCandidateGit(
    root,
    commit === undefined ? ['ls-files', '-z'] : ['ls-tree', '-r', '--name-only', '-z', commit],
  );
  const entries = [];
  for (const relative of listed.split('\0').filter(isTailwindPublicationInput).sort()) {
    const absolute = path.join(root, relative);
    if (commit === undefined && !(await lstat(absolute)).isFile())
      throw new Error(`公開入力には通常fileが必要です: ${relative}`);
    const source =
      commit === undefined
        ? await readFile(absolute)
        : (
            await execFileAsync(
              'git',
              ['-c', `safe.directory=${root}`, 'show', `${commit}:${relative}`],
              { cwd: root, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
            )
          ).stdout;
    // BinaryをUTF-8へ変換せず、宣言済み公開metadataだけtextとして扱う。
    const bytes =
      relative === COURSE_PATH || relative === FRONTEND_PATH || relative === PROVENANCE_PATH
        ? Buffer.from(normalizeTailwindPublicationFile(relative, source.toString('utf8')))
        : source;
    entries.push({ path: relative, sha256: sha256Bytes(bytes) });
  }
  return sha256Text(canonicalJson(entries));
}
