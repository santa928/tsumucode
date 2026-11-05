// @vitest-environment node
/** 実Git原本の退役Python profileを、現行実行能力へ戻さず検査できることを守る。 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseIntegrityVerifiedLessonManifest } from '../../src/core/content/runtimeValidation';
import { compileContent } from './compile';
import { compileCourse, loadAuthoringCourse } from './compileCourse';
import { loadChapterPackage } from './loadChapterPackage';
import { readSplitCourseArtifacts } from './readSplitCourseArtifacts';
import { ExerciseSourceSchema } from './sourceSchema';
import { splitCourseArtifacts } from './splitCourseArtifacts';

const exec = promisify(execFile);
// This object must be present in the checkout/CI object store. Do not synthesize old=l11.
const sourceCommit = 'd1997001d067e0712bc66aec49d15306eb2fcaec';
const courseId = 'python-basics';
const lessonId = 'python-basics-ch01-l07';
const exerciseId = `${lessonId}-e01`;
const exerciseDirectory = `chapters/python-basics-ch01/lessons/${lessonId}/exercises/${exerciseId}`;
const retiredProfile = 'function-return-scope-v1';
const retiredError = /retired.*function-return-scope-v1/iu;
// Independently read from sourceCommit with git show | shasum -a 256, not the compiler.
const sourceDigests = {
  'exercise.yaml': 'e8e513e3734c5c2042c65a474c9742924e28e7d2ea10808432d409897654c0b3',
  'instructions.md': '5c4dc93c61ee51a6d668952b330fefd16295e053a06032d1525f3885a053a889',
  'starter/main.py': 'b1fe60eb5ada1d9d749bea6fc0883af5a901cbd492810f6bf118d8b9bc0308f9',
  'solution/main.py': 'daf870f6374e9442a0e98f38ea3376f32ab3e05bdada0b6850d19f724186f585',
  'fixtures/solution.py': 'daf870f6374e9442a0e98f38ea3376f32ab3e05bdada0b6850d19f724186f585',
  'fixtures/direct-return.py': 'c5079f79ba439ad571add431bd99ca469b4e2bb493fe090bbe51fad3c429cb5f',
  'fixtures/commuted-and-renamed.py':
    '9a20cea5f95c2bde75e47dcb59ff643cceaf884f16680944a3d61ff916b8b729',
  'fixtures/stored-results.py': '978157e73c04397839bc953b1748d6cb0c4ff444a1b099cd799ba713737efaaf',
  'fixtures/starter.py': 'b1fe60eb5ada1d9d749bea6fc0883af5a901cbd492810f6bf118d8b9bc0308f9',
  'fixtures/constant-return.py': 'd2d3227a72f816c7b42ac99d79be3b43e8af5e170834ac9fc19e110de914d430',
  'fixtures/no-return.py': '76d379b466466ca9ed2992a9b6dea28a1dbceecb8846aaa5cc656adbf7f998d2',
  'fixtures/unused-function.py': '61bda81a4b68f3aae6bd7b5b47cb2488f7f4094640daee596bf45de48405f2c9',
  'fixtures/outer-value.py': 'aac5628f7f26ab600594979441d14389661354caa6ae3430f71a82eaf0836110',
  'fixtures/reference-error.py': 'dbb3c0c830a016c712a95ac521fe55c05353c92532cea88bf86b7ded4a87a867',
} as const;

let root: string | undefined;
let courseRoot: string;
let exerciseBytes: Buffer;

function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function assertOriginalBytes(): Promise<void> {
  for (const [relative, expected] of Object.entries(sourceDigests)) {
    expect(digest(await readFile(path.join(courseRoot, exerciseDirectory, relative)))).toBe(
      expected,
    );
  }
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'historical-python-profile-'));
  // Read the real workspace's mounted Git selectors; never init, checkout, or alter its index.
  const { stdout } = await exec(
    'git',
    ['archive', '--format=tar', sourceCommit, `content/${courseId}`],
    { cwd: process.cwd(), encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
  );
  const archive = path.join(root, 'original.tar');
  await writeFile(archive, stdout, { flag: 'wx' });
  await exec('tar', ['-xf', archive, '-C', root]);
  courseRoot = path.join(root, 'content', courseId);
  exerciseBytes = await readFile(path.join(courseRoot, exerciseDirectory, 'exercise.yaml'));
  await assertOriginalBytes();
});

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

describe('historical Python original profile', () => {
  it('データschemaは実旧原本のprofile/fact/10義務を変更せず認識する', () => {
    const source = ExerciseSourceSchema.parse(parse(exerciseBytes.toString('utf8')));
    expect(source.runtime).toMatchObject({ kind: 'python', profile: retiredProfile });
    expect(source.validationRules[0]?.assertion).toEqual({
      kind: 'python-source-fact',
      fact: 'function-return-scoped',
    });
    expect(source.fixtures.map(({ id, expectedStatus }) => [id, expectedStatus])).toEqual([
      ['solution', 'pass'],
      ['direct-return', 'pass'],
      ['commuted-and-renamed', 'pass'],
      ['stored-results', 'pass'],
      ['starter', 'incomplete'],
      ['constant-return', 'incomplete'],
      ['no-return', 'incomplete'],
      ['unused-function', 'incomplete'],
      ['outer-value', 'incomplete'],
      ['reference-error', 'code-error'],
    ]);
  });

  it.each([
    { profile: 'function-return-scope-v999' },
    { capabilityProfile: 'network' },
    { allowNetwork: true },
  ])('歴史的データ認識を未知profileや能力拡張へ広げない: %j', (mutation) => {
    const source = ExerciseSourceSchema.parse(parse(exerciseBytes.toString('utf8')));
    Object.assign(source.runtime!, mutation);
    expect(ExerciseSourceSchema.safeParse(source).success).toBe(false);
  });

  it.each([
    ['compileCourse', () => compileCourse(courseRoot)],
    ['loadAuthoringCourse', () => loadAuthoringCourse(courseRoot)],
    [
      'loadChapterPackage',
      () => loadChapterPackage(path.join(courseRoot, 'chapters/python-basics-ch01/chapter.yaml')),
    ],
  ] as const)('通常%sは旧profileをactive教材として明示拒否する', async (_, load) => {
    await expect(load()).rejects.toThrow(retiredError);
  });

  it('historical compileは旧profileと原本Starter/Solution/全Fixture bytesを保持する', async () => {
    const compiled = await compileCourse(courseRoot, { historicalSource: true });
    const exercise = compiled.authoringExercises?.find(({ id }) => id === exerciseId);
    expect(exercise).toBeDefined();
    expect(exercise?.runtime).toMatchObject({ profile: retiredProfile });
    expect(exercise?.validationRules[0]?.assertion).toEqual({
      kind: 'python-source-fact',
      fact: 'function-return-scoped',
    });
    expect(digest(exercise!.files[0]!.content)).toBe(sourceDigests['starter/main.py']);
    expect(digest(exercise!.solutionFiles[0]!.content)).toBe(sourceDigests['solution/main.py']);
    expect(exercise?.fixtures).toHaveLength(10);
    for (const fixture of exercise!.fixtures) {
      const relative = `fixtures/${fixture.id}.py` as keyof typeof sourceDigests;
      expect(digest(fixture.files[0]!.content)).toBe(sourceDigests[relative]);
    }
    await assertOriginalBytes();
  });

  it('historical全content compileから分割JSONのstrict再読取まで旧literalを保持する', async () => {
    const publicRoot = path.join(root!, 'historical-public');
    await compileContent({
      sourceRoot: path.join(root!, 'content'),
      outputRoot: path.join(publicRoot, 'generated/content'),
      checkOnly: false,
      historicalSource: true,
    });
    const runtime = await readSplitCourseArtifacts(publicRoot, courseId);
    const split = splitCourseArtifacts(runtime);
    const manifest = split.lessons.find((item) => item.lessonId === lessonId)!;
    expect(manifest.lesson.exercises[0]?.runtime).toMatchObject({ profile: retiredProfile });
    // The data reader accepts the original; the application's verified runtime load still rejects it.
    expect(() => parseIntegrityVerifiedLessonManifest(manifest, split.index, lessonId)).toThrow(
      retiredError,
    );
    await assertOriginalBytes();
  });

  it('現行入力はhistorical選択の有無で公開bytesが変わらない', async () => {
    const activeRoot = path.resolve('tests/fixtures/foundation-content/html-css');
    const active = await compileCourse(activeRoot);
    const historical = await compileCourse(activeRoot, { historicalSource: true });
    expect(historical).toEqual(active);
  });
});
