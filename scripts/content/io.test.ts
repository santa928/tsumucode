// @vitest-environment node
/** 教材I/OのRoot境界、symlink、UTF-8、strict YAML契約を検証する。 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readUtf8File, readYamlFile, resolveInside } from './io';

const temporaryRoots: string[] = [];

/** Testごとに隔離した一時Rootを作成する。 */
async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-io-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('resolveInside', () => {
  it('Root配下のcanonical pathだけを返す', () => {
    const root = path.resolve('/workspace/content/html-css');
    expect(resolveInside(root, 'chapters/ch00/chapter.yaml')).toBe(
      path.join(root, 'chapters/ch00/chapter.yaml'),
    );
  });

  it.each(['../outside.yaml', '/outside.yaml', 'C:\\outside.yaml', 'a\\outside.yaml'])(
    'Root外またはplatform依存pathを拒否する: %s',
    (relativePath) => {
      expect(() => resolveInside('/workspace/content', relativePath)).toThrow(
        '教材Rootの外は参照できません',
      );
    },
  );
});

describe('safe content I/O', () => {
  it('regular fileをfatal UTF-8 decodeで読む', async () => {
    const root = await createTemporaryRoot();
    await writeFile(path.join(root, 'lesson.md'), '## 見出し\n本文', 'utf8');
    await expect(readUtf8File(root, 'lesson.md')).resolves.toBe('## 見出し\n本文');
  });

  it('不正UTF-8をreplacement文字へ変換せず拒否する', async () => {
    const root = await createTemporaryRoot();
    await writeFile(path.join(root, 'invalid.yaml'), Uint8Array.from([0xc3, 0x28]));
    await expect(readUtf8File(root, 'invalid.yaml')).rejects.toThrow('UTF-8');
  });

  it('DirectoryをFileとして読まない', async () => {
    const root = await createTemporaryRoot();
    await mkdir(path.join(root, 'directory'));
    await expect(readUtf8File(root, 'directory')).rejects.toThrow('通常File');
  });

  it('存在しないFileをpath付き日本語Errorで報告する', async () => {
    const root = await createTemporaryRoot();
    await expect(readUtf8File(root, 'missing.yaml')).rejects.toThrow(
      '教材Source Fileがありません: missing.yaml',
    );
  });

  it('Course外を指すleaf symlinkを拒否する', async () => {
    const root = await createTemporaryRoot();
    const outside = await createTemporaryRoot();
    await writeFile(path.join(outside, 'secret.txt'), 'secret', 'utf8');
    await symlink(path.join(outside, 'secret.txt'), path.join(root, 'linked.txt'));
    await expect(readUtf8File(root, 'linked.txt')).rejects.toThrow('symlink');
  });

  it('Course外を指すparent symlinkを拒否する', async () => {
    const root = await createTemporaryRoot();
    const outside = await createTemporaryRoot();
    await writeFile(path.join(outside, 'secret.txt'), 'secret', 'utf8');
    await symlink(outside, path.join(root, 'linked-directory'));
    await expect(readUtf8File(root, 'linked-directory/secret.txt')).rejects.toThrow('symlink');
  });

  it('YAML duplicate keyを日本語Errorへ包む', async () => {
    const root = await createTemporaryRoot();
    await writeFile(path.join(root, 'duplicate.yaml'), 'id: first\nid: second\n', 'utf8');
    await expect(
      readYamlFile(root, 'duplicate.yaml', z.object({ id: z.string() }).strict()),
    ).rejects.toThrow('YAMLが不正です');
  });

  it('YAML aliasを拒否する', async () => {
    const root = await createTemporaryRoot();
    await writeFile(path.join(root, 'alias.yaml'), 'id: &id first\ncopy: *id\n', 'utf8');
    await expect(
      readYamlFile(root, 'alias.yaml', z.record(z.string(), z.unknown())),
    ).rejects.toThrow('YAML aliasは使用できません');
  });

  it('YAMLのnon-string keyを拒否する', async () => {
    const root = await createTemporaryRoot();
    await writeFile(path.join(root, 'key.yaml'), '1: value\n', 'utf8');
    await expect(readYamlFile(root, 'key.yaml', z.record(z.string(), z.unknown()))).rejects.toThrow(
      'YAMLが不正です',
    );
  });

  it.each(['__proto__', 'prototype', 'constructor'])('YAMLの危険key %sを拒否する', async (key) => {
    const root = await createTemporaryRoot();
    await writeFile(path.join(root, 'unsafe.yaml'), `"${key}": value\n`, 'utf8');
    await expect(
      readYamlFile(root, 'unsafe.yaml', z.record(z.string(), z.unknown())),
    ).rejects.toThrow('使用できないkey');
  });
});
