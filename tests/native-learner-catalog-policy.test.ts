// @vitest-environment node
import { readFile, mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import process from 'node:process';
import { expect, it } from 'vitest';
const exec = promisify(execFile);
it('keeps policy flags out of both learner image environments without changing the resident assertion', async () => {
  const dockerfile = await readFile('Dockerfile.learning', 'utf8');
  for (const name of ['project', 'next-project']) {
    const stage = dockerfile.split('AS ' + name + '\n')[1]!.split('\nFROM ')[0]!;
    expect(stage).not.toMatch(/^ENV .*?(?:TOKEN|SECRET|SOCKET|TSUMUCODE)/mu);
    expect(stage).toContain('compiled-native-workspaces.json');
  }
  const acceptance = await readFile('scripts/local/resident-acceptance.mjs', 'utf8');
  expect(acceptance).toContain('!/TOKEN|SECRET|SOCKET|TSUMUCODE/iu.test(entry)');
});
it('requires a compiled Next catalog before learner payload handling even without a policy environment flag', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'learner-catalog-policy-'));
  try {
    for (const file of [
      'next-project-protocol.mjs',
      'next-routing-source.mjs',
      'next-data-source.mjs',
      'next-form-source.mjs',
      'next-production-source.mjs',
    ])
      await cp(path.join('scripts/local', file), path.join(root, file));
    const environment = { ...process.env };
    delete environment.TSUMUCODE_REQUIRE_COMPILED_NATIVE_CATALOG;
    const code =
      "import assert from 'node:assert/strict';import {requireCompiledNativeCatalog,nextWorkspace,registerBrowserNextWorkspace} from './next-project-protocol.mjs';requireCompiledNativeCatalog();assert.equal(nextWorkspace('future-lesson').goal,'page-route-query');assert.equal(nextWorkspace('undeclared'),undefined);assert.throws(()=>registerBrowserNextWorkspace('undeclared','page-route-query'));";
    const file = path.join(root, 'compiled-native-workspaces.json');
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        mode: 'compiled',
        workspaces: [
          { id: 'future-lesson', courseId: 'future-course', template: 'page-route-query' },
        ],
      }),
    );
    await exec(process.execPath, ['--input-type=module', '-e', code], {
      cwd: root,
      env: environment,
    });
    await writeFile(
      file,
      JSON.stringify({ schemaVersion: 1, mode: 'bootstrap-legacy', workspaces: [] }),
    );
    await expect(
      exec(process.execPath, ['--input-type=module', '-e', code], { cwd: root, env: environment }),
    ).rejects.toThrow('compiled Native catalog');
    const bootstrap = await readFile('scripts/local/next-project-bootstrap.mjs', 'utf8');
    const guard = bootstrap.indexOf('requireCompiledNativeCatalog();');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(bootstrap.indexOf('const { files, metadata, preview }'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
