// @vitest-environment node
/** Content Compilerが既存出力を壊さない公開境界を検証する。 */
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileContent, publishStaging } from './compile';

const temporaryRoots: string[] = [];

/** Testごとに隔離した一時Rootを作成する。 */
async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-compile-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('compileContent output safety', () => {
  it('generated/content以外をoutputRootにできない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    await mkdir(sourceRoot);
    await expect(
      compileContent({
        sourceRoot,
        outputRoot: path.join(root, 'public/content'),
        checkOnly: false,
      }),
    ).rejects.toThrow('generated/content');
  });

  it('SourceとOutputの包含関係を拒否する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'generated');
    await mkdir(sourceRoot);
    await expect(
      compileContent({
        sourceRoot,
        outputRoot: path.join(sourceRoot, 'content'),
        checkOnly: false,
      }),
    ).rejects.toThrow('SourceとOutput');
  });

  it('検証失敗時に既存Outputを保持しstagingを残さない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'public/generated/content');
    await mkdir(path.join(sourceRoot, 'broken-course'), { recursive: true });
    await writeFile(path.join(sourceRoot, 'broken-course/course.yaml'), 'invalid: true\n', 'utf8');
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(outputRoot, 'sentinel.txt'), 'keep', 'utf8');

    await expect(compileContent({ sourceRoot, outputRoot, checkOnly: false })).rejects.toThrow();
    await expect(readFile(path.join(outputRoot, 'sentinel.txt'), 'utf8')).resolves.toBe('keep');
    const siblings = await readdir(path.dirname(outputRoot));
    expect(siblings.some((entry) => entry.startsWith('content.staging-'))).toBe(false);
    expect(siblings.some((entry) => entry.startsWith('content.backup-'))).toBe(false);
    expect(siblings.includes('content.lock')).toBe(false);
  });

  it('Course directoryのsymlinkを黙って無視しない', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const outside = path.join(root, 'outside-course');
    await mkdir(sourceRoot);
    await mkdir(outside);
    await writeFile(path.join(outside, 'course.yaml'), 'schemaVersion: 1\n', 'utf8');
    await symlink(outside, path.join(sourceRoot, 'linked-course'));

    await expect(
      compileContent({
        sourceRoot,
        outputRoot: path.join(root, 'public/generated/content'),
        checkOnly: true,
      }),
    ).rejects.toThrow('symlink');
  });

  it('stagingの公開失敗時に既存Outputを自動復元する', async () => {
    const root = await createTemporaryRoot();
    const outputRoot = path.join(root, 'content');
    const missingStagingRoot = path.join(root, 'missing-staging');
    const backupRoot = path.join(root, 'content.backup');
    await mkdir(outputRoot);
    await writeFile(path.join(outputRoot, 'sentinel.txt'), 'old', 'utf8');

    await expect(publishStaging(missingStagingRoot, outputRoot, backupRoot)).rejects.toThrow();

    await expect(readFile(path.join(outputRoot, 'sentinel.txt'), 'utf8')).resolves.toBe('old');
    await expect(lstat(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('backup Cleanup失敗時に新Outputを戻して既存Outputを復元する', async () => {
    const root = await createTemporaryRoot();
    const outputRoot = path.join(root, 'content');
    const stagingRoot = path.join(root, 'content.staging');
    const backupRoot = path.join(root, 'content.backup');
    await mkdir(outputRoot);
    await mkdir(stagingRoot);
    await writeFile(path.join(outputRoot, 'sentinel.txt'), 'old', 'utf8');
    await writeFile(path.join(stagingRoot, 'sentinel.txt'), 'new', 'utf8');

    await expect(
      publishStaging(stagingRoot, outputRoot, backupRoot, async () => {
        throw new Error('cleanup failed');
      }),
    ).rejects.toThrow('旧教材Outputを復元');

    await expect(readFile(path.join(outputRoot, 'sentinel.txt'), 'utf8')).resolves.toBe('old');
    await expect(readFile(path.join(stagingRoot, 'sentinel.txt'), 'utf8')).resolves.toBe('new');
    await expect(lstat(backupRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
