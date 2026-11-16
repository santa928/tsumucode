// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { compileContent } from '../../../../scripts/content/compile';
import { assertCandidateContentSource, resolveCandidateSource } from './candidateContentSource.mjs';
import { repositoryEnvironment } from '../../../../scripts/release/v2/identity';
import { buildInventory } from '../../../../scripts/release/v2/inventory';

it('rejects changed, hidden and untracked content against an independent Git Source', () => {
  expect(() =>
    execFileSync(process.execPath, ['--test', 'tests/local/candidate-content-source.test.mjs'], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    }),
  ).not.toThrow();
}, 40000);

it('compiles current content only after binding it to the event Source tree', async () => {
  const root = process.cwd();
  const environment = await repositoryEnvironment(root);
  const source = resolveCandidateSource(process.env, () =>
    execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, env: environment, encoding: 'utf8' }).trim(),
  );
  await assertCandidateContentSource(root, source, environment);
  const temporary = await mkdtemp(path.join(await realpath(os.tmpdir()), 'candidate-content-compile-'));
  try {
    const compiled = await compileContent({
      sourceRoot: path.join(root, 'content'),
      outputRoot: path.join(temporary, 'generated/content'),
      checkOnly: true,
    });
    expect(buildInventory(compiled.compilations).courses.length).toBeGreaterThan(0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 60000);
