// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  MovementDeclarationSchema,
  readMovementDeclaration,
} from '../../../../scripts/release/v2/movement';
import { readMovementBaselineProofs } from '../../../../scripts/release/v2/movementBaseline';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { releaseFixture } from './releaseFixture';

const exec = promisify(execFile);
const eb2 = 'eb2fe6f8e06409569f173efb2fe6275c46a535cf';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movement-binding-selection-'));
  roots.push(root);
  await mkdir(path.join(root, 'docs/quality'), { recursive: true });
  return root;
}

async function declarationRoot() {
  const root = await temporaryRoot();
  const ignored = new Set([
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_NAMESPACE',
  ]);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !ignored.has(name)),
  );
  const git = async (...args: string[]) =>
    (await exec('git', args, { cwd: root, env, encoding: 'utf8' })).stdout.trim();
  await git('init', '-b', 'main');
  await git(
    '-c',
    'user.name=Unit Fixture',
    '-c',
    'user.email=unit@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'synthetic binding source',
  );
  // 読込選択の合成protocol。実際の新しい承認や公開根拠としては使わない。
  const declaration = MovementDeclarationSchema.parse(
    JSON.parse(await readFile('docs/quality/movement-v2.json', 'utf8')),
  );
  declaration.body.candidateContentCommit = await git('rev-parse', 'HEAD');
  return { root, declaration };
}

it('eb2用の宣言を明示的に優先し、旧宣言の元bytesは保持する', async () => {
  const { root, declaration } = await declarationRoot();
  const previous = JSON.stringify(declaration);
  await writeFile(path.join(root, 'docs/quality/movement-v2.json'), previous);
  const current = structuredClone(declaration);
  current.body.baseline.sourceCommit = eb2;
  await writeFile(path.join(root, 'docs/quality/movement-eb2-v2.json'), JSON.stringify(current));
  expect(await readMovementDeclaration(root)).toEqual(current);
  expect(await readFile(path.join(root, 'docs/quality/movement-v2.json'), 'utf8')).toBe(previous);
});

it('新宣言が壊れていても旧宣言へ戻して成功させない', async () => {
  const { root, declaration } = await declarationRoot();
  await writeFile(path.join(root, 'docs/quality/movement-v2.json'), JSON.stringify(declaration));
  await writeFile(path.join(root, 'docs/quality/movement-eb2-v2.json'), '{broken');
  await expect(readMovementDeclaration(root)).rejects.toThrow();
});

it('新宣言が無い旧checkoutは従来宣言を読める', async () => {
  const { root, declaration } = await declarationRoot();
  await writeFile(path.join(root, 'docs/quality/movement-v2.json'), JSON.stringify(declaration));
  expect(await readMovementDeclaration(root)).toEqual(declaration);
});

it('新宣言でも存在しないcandidateContentCommitを拒否する', async () => {
  const { root, declaration } = await declarationRoot();
  declaration.body.candidateContentCommit = '9'.repeat(40);
  await writeFile(
    path.join(root, 'docs/quality/movement-eb2-v2.json'),
    JSON.stringify(declaration),
  );
  await expect(readMovementDeclaration(root)).rejects.toThrow();
});

it('eb2 bindingに対応する元proofだけを選び、再captureは時刻だけの差を許す', async () => {
  const root = await temporaryRoot();
  const row = releaseFixture().capturedBaseline;
  const original = { ...row.proof, sourceCommit: eb2 };
  const current = { ...original, observedAt: '2026-11-06T10:00:00Z' };
  const binding = {
    deploymentId: original.deploymentId,
    sourceCommit: eb2,
    sourceRecordDigest: hashValue(original),
    inventoryDigest: original.inventoryDigest,
  };
  const baseline = { ...row.baseline, sourceCommit: eb2, sourceRecordDigest: hashValue(current) };
  await writeFile(
    path.join(root, 'docs/quality/movement-baseline-proof-v2.json'),
    JSON.stringify(row.proof),
  );
  await writeFile(
    path.join(root, 'docs/quality/movement-eb2-baseline-proof-v2.json'),
    JSON.stringify(original),
  );
  expect(await readMovementBaselineProofs(root, binding, baseline, current)).toEqual({
    original,
    current,
  });
  const altered = { ...current, publicFiles: current.publicFiles + 1 };
  await expect(
    readMovementBaselineProofs(
      root,
      binding,
      { ...baseline, sourceRecordDigest: hashValue(altered) },
      altered,
    ),
  ).rejects.toThrow(/beyond observedAt/u);
});
