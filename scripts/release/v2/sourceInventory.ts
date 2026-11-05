import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { compileCourse } from '../../content/compileCourse';
import { buildInventory } from './inventory';
import { CommitSchema, IdSchema } from './schema';
import { repositoryEnvironment } from './identity';
const exec = promisify(execFile);
/** Read the original Git source, never the mutable candidate or declared content hash alone. */
/** Git原本を同じCompilerで読み、移動比較に必要なauthoring原本も返す。 */
export async function readAuthoringAtSource(root: string, input: string, courseInput: string) {
  const courseId = IdSchema.parse(courseInput);
  const sourceCommit = CommitSchema.parse(input),
    environment = await repositoryEnvironment(root);
  await exec('git', ['cat-file', '-e', sourceCommit + '^{commit}'], {
    cwd: root,
    env: environment,
  });
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'content-original-source-'));
  try {
    const { stdout } = await exec(
      'git',
      ['archive', '--format=tar', sourceCommit, 'content/' + courseId],
      {
        cwd: root,
        env: environment,
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const archive = path.join(temporary, 'source.tar');
    await writeFile(archive, stdout, { flag: 'wx', mode: 0o600 });
    await exec('tar', ['-xf', archive, '-C', temporary]);
    const result = await compileCourse(path.join(temporary, 'content', courseId), {
      historicalSource: true,
    });
    return {
      sourceCommit,
      inventory: buildInventory([result]),
      authoringExercises: result.authoringExercises,
      compilation: result,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** 既存の原本receipt readerが要求するstrictな返値形状を維持する。 */
export async function readInventoryAtSource(root: string, input: string, courseInput: string) {
  const { sourceCommit, inventory } = await readAuthoringAtSource(root, input, courseInput);
  return { sourceCommit, inventory };
}
