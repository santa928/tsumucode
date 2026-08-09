// @vitest-environment node
/** Content Compilerが既存出力を壊さない公開境界を検証する。 */
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileContent, publishStaging } from './compile';

const temporaryRoots: string[] = [];

/** 全JavaScript教材を複製・Compileする統合Caseへ許容する上限時間。 */
const FULL_JAVASCRIPT_COMPILE_TIMEOUT_MS = 20_000;

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
  it('production compilerはCatalog v3と分割Courseだけをatomic publishする', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'public/generated/content');
    await cp(path.resolve('tests/fixtures/foundation-content'), sourceRoot, { recursive: true });

    await compileContent({ sourceRoot, outputRoot, checkOnly: false });

    await expect(readFile(path.join(outputRoot, 'catalog-v3.json'), 'utf8')).resolves.toContain(
      '"schemaVersion":3',
    );
    await expect(
      lstat(path.join(outputRoot, 'courses/html-css/index.json')),
    ).resolves.toBeDefined();
    await expect(
      lstat(path.join(outputRoot, 'courses/html-css/lessons/lesson-first-heading.json')),
    ).resolves.toBeDefined();
    await expect(lstat(path.join(outputRoot, 'catalog.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(lstat(path.join(outputRoot, 'courses/html-css.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it(
    'draft JavaScript Courseを直リンク用に出力し公開Learning Pathへ掲載しない',
    async () => {
      const root = await createTemporaryRoot();
      const sourceRoot = path.join(root, 'source');
      const outputRoot = path.join(root, 'public/generated/content');
      await cp(path.resolve('tests/fixtures/foundation-content'), sourceRoot, { recursive: true });
      await cp(path.resolve('content/javascript'), path.join(sourceRoot, 'javascript'), {
        recursive: true,
      });

      const summary = await compileContent({ sourceRoot, outputRoot, checkOnly: false });
      const javaScriptEntry = summary.catalog.courses.find(({ id }) => id === 'javascript');
      const publishedPathCourseIds = summary.catalog.learningPaths
        .filter(({ publicationStatus }) => publicationStatus === 'published')
        .flatMap(({ steps }) => steps.map(({ courseId }) => courseId));

      expect(javaScriptEntry).toMatchObject({
        id: 'javascript',
        publicationStatus: 'draft',
        indexPath: 'generated/content/courses/javascript/index.json',
        lessonStarts: [
          {
            lessonId: 'javascript-ch00-l01',
            target: { kind: 'slide', targetId: 'javascript-ch00-l01-s01' },
          },
          {
            lessonId: 'javascript-ch01-l01',
            target: { kind: 'slide', targetId: 'javascript-ch01-l01-s01' },
          },
          {
            lessonId: 'javascript-ch01-l02',
            target: { kind: 'slide', targetId: 'javascript-ch01-l02-s01' },
          },
          {
            lessonId: 'javascript-ch01-l03',
            target: { kind: 'slide', targetId: 'javascript-ch01-l03-s01' },
          },
          {
            lessonId: 'javascript-ch01-l04',
            target: { kind: 'slide', targetId: 'javascript-ch01-l04-s01' },
          },
          {
            lessonId: 'javascript-ch02-l01',
            target: { kind: 'slide', targetId: 'javascript-ch02-l01-s01' },
          },
          {
            lessonId: 'javascript-ch02-l02',
            target: { kind: 'slide', targetId: 'javascript-ch02-l02-s01' },
          },
          {
            lessonId: 'javascript-ch02-l03',
            target: { kind: 'slide', targetId: 'javascript-ch02-l03-s01' },
          },
          {
            lessonId: 'javascript-ch02-l04',
            target: { kind: 'slide', targetId: 'javascript-ch02-l04-s01' },
          },
          {
            lessonId: 'javascript-ch03-l01',
            target: { kind: 'slide', targetId: 'javascript-ch03-l01-s01' },
          },
          {
            lessonId: 'javascript-ch03-l02',
            target: { kind: 'slide', targetId: 'javascript-ch03-l02-s01' },
          },
          {
            lessonId: 'javascript-ch03-l03',
            target: { kind: 'slide', targetId: 'javascript-ch03-l03-s01' },
          },
          {
            lessonId: 'javascript-ch03-l04',
            target: { kind: 'slide', targetId: 'javascript-ch03-l04-s01' },
          },
          {
            lessonId: 'javascript-ch03-l05',
            target: { kind: 'slide', targetId: 'javascript-ch03-l05-s01' },
          },
        ],
      });
      expect(publishedPathCourseIds).not.toContain('javascript');
      await expect(
        lstat(path.join(outputRoot, 'courses/javascript/index.json')),
      ).resolves.toBeDefined();
      await expect(
        lstat(path.join(outputRoot, 'courses/javascript/lessons/javascript-ch00-l01.json')),
      ).resolves.toBeDefined();
      const javaScriptIndex = JSON.parse(
        await readFile(path.join(outputRoot, 'courses/javascript/index.json'), 'utf8'),
      ) as {
        readonly estimatedMinutes: number;
        readonly expectedTotals: {
          readonly chapters: number;
          readonly lessons: number;
          readonly conceptSlides: number;
          readonly standardExercises: number;
          readonly estimatedMinutes: number;
        };
      };
      expect(javaScriptIndex).toMatchObject({
        estimatedMinutes: 210,
        expectedTotals: {
          chapters: 4,
          lessons: 14,
          conceptSlides: 56,
          standardExercises: 14,
          estimatedMinutes: 210,
        },
      });
    },
    FULL_JAVASCRIPT_COMPILE_TIMEOUT_MS,
  );

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

  it('LearningPathが未知Courseを参照した場合も既存Outputを保持する', async () => {
    const root = await createTemporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'public/generated/content');
    await cp(path.resolve('tests/fixtures/foundation-content'), sourceRoot, { recursive: true });
    await writeFile(
      path.join(sourceRoot, 'learning-paths/frontend.yaml'),
      `schemaVersion: 1
id: frontend
title: フロントエンド学習パス
description: 未知Course参照を拒否するテストです。
publicationStatus: published
steps:
  - courseId: missing-course
    role: required
    prerequisiteCourseIds: []
`,
      'utf8',
    );
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(outputRoot, 'sentinel.txt'), 'keep', 'utf8');

    await expect(compileContent({ sourceRoot, outputRoot, checkOnly: false })).rejects.toThrow(
      /LearningPath.*Course参照先がありません/u,
    );
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
