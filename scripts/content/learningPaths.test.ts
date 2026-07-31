// @vitest-environment node
/** LearningPath authoring sourceの安全な走査とstrict変換を検証する。 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileLearningPaths } from './learningPaths';

const temporaryRoots: string[] = [];

/** Testごとに隔離した一時LearningPath Rootを作る。 */
async function createLearningPathRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-paths-'));
  temporaryRoots.push(root);
  return root;
}

/** IDだけ差し替えられる最小LearningPath YAMLを返す。 */
function validPathYaml(id: string): string {
  return `schemaVersion: 1
id: ${id}
title: ${id} 学習パス
description: ${id} を順番に学びます。
publicationStatus: published
steps:
  - courseId: html-css
    role: required
    prerequisiteCourseIds: []
`;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('compileLearningPaths', () => {
  it('filename順にstrict sourceをruntime定義へ変換する', async () => {
    const root = await createLearningPathRoot();
    await writeFile(path.join(root, 'python.yaml'), validPathYaml('python'), 'utf8');
    await writeFile(path.join(root, 'frontend.yaml'), validPathYaml('frontend'), 'utf8');

    await expect(compileLearningPaths(root)).resolves.toEqual([
      expect.objectContaining({ id: 'frontend' }),
      expect.objectContaining({ id: 'python' }),
    ]);
  });

  it('存在しない任意Path RootはLearningPath 0件として扱う', async () => {
    const root = await createLearningPathRoot();
    await expect(compileLearningPaths(path.join(root, 'missing'))).resolves.toEqual([]);
  });

  it('filenameとLearningPath IDの不一致を拒否する', async () => {
    const root = await createLearningPathRoot();
    await writeFile(path.join(root, 'frontend.yaml'), validPathYaml('python'), 'utf8');

    await expect(compileLearningPaths(root)).rejects.toThrow(
      'LearningPath filenameとIDが一致しません',
    );
  });

  it('非YAML File、子Directory、symlinkを拒否する', async () => {
    const nonYamlRoot = await createLearningPathRoot();
    await writeFile(path.join(nonYamlRoot, 'notes.txt'), 'not allowed', 'utf8');
    await expect(compileLearningPaths(nonYamlRoot)).rejects.toThrow('YAML Fileだけ');

    const directoryRoot = await createLearningPathRoot();
    await mkdir(path.join(directoryRoot, 'nested'));
    await expect(compileLearningPaths(directoryRoot)).rejects.toThrow('通常Fileだけ');

    const symlinkRoot = await createLearningPathRoot();
    const outside = path.join(await createLearningPathRoot(), 'frontend.yaml');
    await writeFile(outside, validPathYaml('frontend'), 'utf8');
    await symlink(outside, path.join(symlinkRoot, 'frontend.yaml'));
    await expect(compileLearningPaths(symlinkRoot)).rejects.toThrow('symlink');
  });

  it('未知fieldと重複Course Stepを拒否する', async () => {
    const unknownRoot = await createLearningPathRoot();
    await writeFile(
      path.join(unknownRoot, 'frontend.yaml'),
      `${validPathYaml('frontend')}unexpected: true\n`,
      'utf8',
    );
    await expect(compileLearningPaths(unknownRoot)).rejects.toThrow();

    const duplicateRoot = await createLearningPathRoot();
    await writeFile(
      path.join(duplicateRoot, 'frontend.yaml'),
      `${validPathYaml('frontend')}  - courseId: html-css
    role: recommended
    prerequisiteCourseIds: []
`,
      'utf8',
    );
    await expect(compileLearningPaths(duplicateRoot)).rejects.toThrow(
      'LearningPathのCourse Stepが重複しています',
    );
  });
});
