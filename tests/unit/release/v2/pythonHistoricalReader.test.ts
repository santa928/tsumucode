// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileCourse } from '../../../../scripts/content/compileCourse';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import { verifyContent } from '../../../../scripts/release/v2/content';
import { hashValue } from '../../../../scripts/release/v2/identity';
import {
  readVerifiedPythonHistoricalAcceptances,
  PYTHON_HISTORICAL_PATH,
} from '../../../../scripts/release/v2/pythonHistoricalAcceptance';
import { gitFixtureEnvironment } from './gitFixture';

const exec = promisify(execFile);
let root: string;
const courseIds = ['python-practice', 'python-oop'];
const policyPath = 'docs/quality/content-v2-receipts.json';
async function inventory(ids = courseIds) {
  return buildInventory(
    await Promise.all(ids.map((id) => compileCourse(path.join(root, 'content', id)))),
  );
}
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'python-historical-public-'));
  await exec('git', ['init', '--quiet', root], { env: gitFixtureEnvironment() });
  const common = (
    await exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  ).stdout.trim();
  await writeFile(
    path.join(root, '.git/objects/info/alternates'),
    path.join(common, 'objects') + '\n',
  );
  for (const id of courseIds) {
    await cp('content/' + id, path.join(root, 'content', id), { recursive: true });
    const file = path.join(root, 'content', id, 'course.yaml');
    await writeFile(
      file,
      (await readFile(file, 'utf8')).replace(
        'publicationStatus: draft',
        'publicationStatus: published',
      ),
    );
  }
  await mkdir(path.join(root, 'docs/quality'), { recursive: true });
  for (const file of [
    PYTHON_HISTORICAL_PATH,
    policyPath,
    ...courseIds.map((id) => 'docs/quality/content-review-' + id + '.yaml'),
  ])
    await cp(file, path.join(root, file));
}, 20000);
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('私有原本を持ち込まないPython歴史受入reader', () => {
  it('公開Gitと現Sourceを再照合し、stageと同じcontent gateへ14件を渡す', async () => {
    const input = await inventory();
    const rows = await readVerifiedPythonHistoricalAcceptances(root, input);
    expect(rows).toHaveLength(2);
    const result = verifyContent(input, [], undefined, [], rows);
    expect(result.status).toBe('historical');
    expect(result.newlyApprovedLessons).toEqual([]);
    expect(result.historicallyAcceptedLessons).toHaveLength(14);
    expect(result.historicallyAcceptedLessons).toEqual(
      expect.arrayContaining([
        'python-practice/python-practice-ch01-l01',
        'python-oop/python-oop-ch04-l01',
      ]),
    );
  });

  it.each(courseIds)('%s の古いinventoryを再hashしても実原稿との不一致を拒否', async (id) => {
    const input = await inventory();
    const course = input.courses.find((course) => course.id === id)!;
    course.lessons[0]!.exercises[0]!.fixtures.pop();
    course.lessons[0]!.exerciseDigest = hashValue(course.lessons[0]!.exercises);
    await expect(readVerifiedPythonHistoricalAcceptances(root, input)).rejects.toThrow(
      /current source/,
    );
  });

  it.each(courseIds)('%s の現台帳拒否を旧承認で覆さない', async (id) => {
    const file = path.join(root, 'docs/quality/content-review-' + id + '.yaml');
    const original = await readFile(file, 'utf8');
    try {
      await writeFile(file, original.replace('decision: approved', 'decision: rejected'));
      await expect(
        readVerifiedPythonHistoricalAcceptances(root, await inventory()),
      ).rejects.toThrow();
    } finally {
      await writeFile(file, original);
    }
  });

  it.each(courseIds)('%s の別hash・別Lessonを名乗る撤回も保守的に拒否', async (id) => {
    const file = path.join(root, policyPath);
    const original = await readFile(file, 'utf8');
    try {
      const policy = JSON.parse(original) as { withdrawals: unknown[] };
      policy.withdrawals.push({
        courseId: id,
        lessonId: 'different-lesson',
        learnerDigest: '0'.repeat(64),
        sourceCommit: '0'.repeat(40),
        reason: 'known-finding',
      });
      await writeFile(file, JSON.stringify(policy));
      await expect(
        readVerifiedPythonHistoricalAcceptances(root, await inventory()),
      ).rejects.toThrow(/withdrawal/);
    } finally {
      await writeFile(file, original);
    }
  });

  it('共有glossaryを変えた実践の古いinventoryと更新済inventoryを両方拒否', async () => {
    const input = await inventory(['python-practice']);
    const file = path.join(root, 'content/python-practice/glossary.yaml');
    const original = await readFile(file, 'utf8');
    try {
      expect(original).toContain('各要素を変換し、');
      await writeFile(file, original.replace('各要素を変換し、', '各要素の値を変換し、'));
      await expect(readVerifiedPythonHistoricalAcceptances(root, input)).rejects.toThrow(
        /current source/,
      );
      await expect(
        readVerifiedPythonHistoricalAcceptances(root, await inventory(['python-practice'])),
      ).rejects.toThrow(/learner content/);
    } finally {
      await writeFile(file, original);
      expect(await readFile(file, 'utf8')).toBe(original);
    }
  });

  it('認証sidecar欠落で通常のcontent requirementへ戻し、改変は拒否する', async () => {
    const file = path.join(root, PYTHON_HISTORICAL_PATH);
    const original = await readFile(file, 'utf8');
    try {
      await rm(file);
      const input = await inventory();
      expect(await readVerifiedPythonHistoricalAcceptances(root, input)).toEqual([]);
      expect(() => verifyContent(input, [])).toThrow(/Missing content/);
      await writeFile(file, original.replace('/root/historical_inspection', 'forged-inspector'));
      await expect(readVerifiedPythonHistoricalAcceptances(root, input)).rejects.toThrow(/receipt/);
    } finally {
      await writeFile(file, original);
    }
  });

  it('旧Git object欠落をネットワーク取得や自己申告で埋めない', async () => {
    const file = path.join(root, '.git/objects/info/alternates');
    const original = await readFile(file, 'utf8');
    try {
      await rm(file);
      await expect(
        readVerifiedPythonHistoricalAcceptances(root, await inventory()),
      ).rejects.toThrow();
    } finally {
      await writeFile(file, original);
    }
  });

  it('draftの既存Courseには公開や歴史承認を追加しない', async () => {
    const draft = await inventory();
    for (const course of draft.courses) course.publicationStatus = 'draft';
    expect(await readVerifiedPythonHistoricalAcceptances(root, draft)).toEqual([]);
    expect(verifyContent(draft, [])).toMatchObject({
      status: 'maintenance',
      carriedLessons: [],
      newlyApprovedLessons: [],
    });
  });
});
