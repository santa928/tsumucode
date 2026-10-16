import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { z } from 'zod';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { CommitShaSchema } from './releaseSchema';
import { sha256Text } from './releaseHashes';
import {
  resolveDraftReleaseCourseContract,
  draftReleaseMetadataPaths,
  type DraftReleaseCourseId,
} from './draftReleaseCourseContracts';
import type { DraftQualityScope } from './draftCourseQualitySchema';

const execFileAsync = promisify(execFile);
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

/** Gitは指定rootで読み取りだけ行う。safe.directoryはこの呼出しだけに限定する。 */
export async function readDraftCandidateGit(
  repositoryRoot: string,
  arguments_: readonly string[],
): Promise<string> {
  const root = path.resolve(repositoryRoot);
  const { stdout } = await execFileAsync('git', ['-c', `safe.directory=${root}`, ...arguments_], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

/** 固定commitのGit treeを取得し、元証拠のtree付替えを拒否できるようにする。 */
export async function readDraftSourceTree(root: string, sourceCommit: string): Promise<string> {
  const commit = CommitShaSchema.parse(sourceCommit);
  return CommitShaSchema.parse(
    (await readDraftCandidateGit(root, ['rev-parse', `${commit}^{tree}`])).trim(),
  );
}

/** 宣言済み6記録以外のProduct変更・未追跡fileを拒否し、metadata commitとの循環を避ける。 */
export async function assertDraftSourceUnchanged(
  root: string,
  sourceCommit: string,
): Promise<void> {
  const commit = CommitShaSchema.parse(sourceCommit);
  const metadata = draftReleaseMetadataPaths();
  const paths = ['--', '.', ...[...metadata].map((relative) => `:(exclude,literal)${relative}`)];
  await readDraftCandidateGit(root, ['merge-base', '--is-ancestor', commit, 'HEAD']);
  try {
    await readDraftCandidateGit(root, ['diff', '--quiet', commit, 'HEAD', ...paths]);
    await readDraftCandidateGit(root, ['diff', '--quiet', 'HEAD', ...paths]);
  } catch (error) {
    if ((error as { code?: number }).code === 1) {
      throw new Error('固定Source以降のProduct入力が変更されています', { cause: error });
    }
    throw error;
  }
  const untracked = (
    await readDraftCandidateGit(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  )
    .split('\0')
    .filter((relative) => relative !== '' && !metadata.has(relative));
  if (untracked.length > 0)
    throw new Error(`未追跡Product fileがあります: ${untracked.join(', ')}`);
}

/**
 * 対象Lessonと固定された実行・画面入力をGit object/path/modeから固定する。
 * 他Courseの教材、公開記録、検査文書だけの変更では既存観測を失効させない。
 * scope内の変更は保守的に拒否し、呼出し側から任意pathを除外させない。
 */
export async function hashDraftQualityInputs(
  root: string,
  sourceCommit: string,
  courseId: DraftReleaseCourseId,
  scope: DraftQualityScope,
  lessonIds: readonly string[],
): Promise<string> {
  const commit = CommitShaSchema.parse(sourceCommit);
  const contract = resolveDraftReleaseCourseContract(courseId);
  const selected = new Set(lessonIds);
  if (
    selected.size === 0 ||
    selected.size !== lessonIds.length ||
    lessonIds.some((id) => !contract.lessonIds.some((expected) => expected === id))
  )
    throw new Error('入力指紋のLessonは選択Courseの重複しない固定IDが必要です');

  const tree = await readDraftCandidateGit(root, ['ls-tree', '-r', '-z', commit]);
  const entries: { path: string; mode: string; objectId: string }[] = [];
  const seenLessons = new Set<string>();
  for (const entry of tree.split('\0').filter(Boolean)) {
    const match = /^(\d+) (blob|commit) ([a-f0-9]{40})\t(.+)$/u.exec(entry);
    if (!match) continue;
    const [, mode, type, objectId, relative] = match;
    if (mode === undefined || objectId === undefined || relative === undefined) continue;
    const lesson = lessonIds.find((id) =>
      relative.startsWith(
        `${contract.sourceRoot}/chapters/${id.replace(/-l\d+$/u, '')}/lessons/${id}/`,
      ),
    );
    const runtimeLessonFile =
      !relative.endsWith('.md') || /\/(?:starter|fixtures|solution)\//u.test(relative);
    const courseShared =
      scope !== 'runtime' &&
      relative.startsWith(`${contract.sourceRoot}/`) &&
      !relative.includes('/lessons/');
    const common =
      (lesson !== undefined && (scope !== 'runtime' || runtimeLessonFile)) ||
      (scope !== 'runtime' && relative === `${contract.sourceRoot}/course.yaml`) ||
      relative.startsWith(`${contract.sourceRoot}/assets/`) ||
      courseShared ||
      relative.startsWith('scripts/content/') ||
      relative.startsWith('scripts/build/') ||
      relative === 'scripts/inline-production-css.ts' ||
      (relative.startsWith('public/') && !relative.startsWith('public/generated/')) ||
      ROOT_INPUTS.has(relative);
    const runtime =
      scope === 'runtime' &&
      (relative.startsWith('src/') ||
        relative.startsWith('scripts/local/') ||
        relative.startsWith('vendor/') ||
        relative === 'Dockerfile.learning' ||
        relative === 'compose.learning.yaml');
    const userInterface = scope !== 'runtime' && relative.startsWith('src/');
    const delivery =
      scope === 'delivery' &&
      (relative.startsWith('scripts/build/') ||
        relative.startsWith('vendor/') ||
        (relative.startsWith('public/') && !relative.startsWith('public/generated/')) ||
        relative === 'vite.config.ts' ||
        relative === 'index.html' ||
        relative === 'scripts/inline-production-css.ts');
    if (!common && !runtime && !userInterface && !delivery) continue;
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755'))
      throw new Error(`入力指紋は通常fileだけを許可します: ${relative}`);
    if (lesson !== undefined && (scope !== 'runtime' || runtimeLessonFile)) seenLessons.add(lesson);
    entries.push({ path: relative, mode, objectId });
  }
  if (seenLessons.size !== selected.size) throw new Error('元Sourceに対象Lessonの入力がありません');
  // RuntimeはLesson追加だけのrevision/総数で失効させず、実行器の選択は必ず固定する。
  const runtimeConfiguration =
    scope === 'runtime'
      ? z
          .object({
            schemaVersion: z.literal(1),
            id: z.literal(courseId),
            runnerId: z.string().min(1),
            validatorId: z.string().min(1),
          })
          .parse(
            parse(
              await readDraftCandidateGit(root, [
                'show',
                `${commit}:${contract.sourceRoot}/course.yaml`,
              ]),
            ),
          )
      : undefined;
  return sha256Text(
    canonicalJson({
      courseId,
      scope,
      lessonIds: [...selected].sort(),
      entries,
      ...(runtimeConfiguration === undefined ? {} : { runtimeConfiguration }),
    }),
  );
}
