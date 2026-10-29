// @vitest-environment node
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import process from 'node:process';
import { expect, it } from 'vitest';
import { registerBrowserNextWorkspace, NEXT_PROFILE } from './next-project-protocol.mjs';
import { nextFormPostRoute, isNextForm } from './next-form-preview.mjs';
import { nextDataRequest, weatherRscRoute } from './next-data-preview.mjs';
import { lessonThemeRequestHeaders } from './next-form-cookie.mjs';
const exec = promisify(execFile);
it('loads a sealed image catalog in a fresh Node process and fails on bootstrap or undeclared IDs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-runtime-catalog-'));
  try {
    for (const file of [
      'next-project-protocol.mjs',
      'next-routing-source.mjs',
      'next-data-source.mjs',
      'next-form-source.mjs',
      'next-production-source.mjs',
    ])
      await cp(path.join('scripts/local', file), path.join(root, file));
    const catalog = {
      schemaVersion: 1,
      mode: 'compiled',
      workspaces: [{ id: 'future-page', courseId: 'future-topic', template: 'page-route-query' }],
    };
    const file = path.join(root, 'compiled-native-workspaces.json');
    await writeFile(file, JSON.stringify(catalog));
    const options = {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TSUMUCODE_REQUIRE_COMPILED_NATIVE_CATALOG: '1' },
    };
    const code =
      "import assert from 'node:assert/strict';import {nextWorkspace,registerBrowserNextWorkspace} from './next-project-protocol.mjs';assert.equal(nextWorkspace('future-page').goal,'page-route-query');assert.equal(nextWorkspace('next-ch01-l01-e01'),undefined);assert.equal(nextWorkspace('undeclared'),undefined);assert.throws(()=>registerBrowserNextWorkspace('undeclared','page-route-query'));";
    await exec(process.execPath, ['--input-type=module', '-e', code], options);
    await writeFile(
      file,
      JSON.stringify({ schemaVersion: 1, mode: 'bootstrap-legacy', workspaces: [] }),
    );
    await expect(
      exec(process.execPath, ['--input-type=module', '-e', code], options),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('keeps form/cookie and weather restrictions for declared aliases instead of fixed lesson IDs', () => {
  registerBrowserNextWorkspace('future-form', 'form-route-validation');
  registerBrowserNextWorkspace('future-weather', 'loading-error-not-found');
  const runId = '01234567-89ab-4cde-8123-0123456789ab';
  const form = {
    workspaceId: 'future-form',
    runId,
    profile: NEXT_PROFILE,
    sourceRevision: 1,
    sourceHash: 'a'.repeat(64),
  };
  const base = '/w/future-form/' + runId;
  expect(isNextForm(form.workspaceId)).toBe(true);
  expect(isNextForm('undeclared-form')).toBe(false);
  expect(nextFormPostRoute(base + '/api/note', form)).toBe(true);
  expect(nextFormPostRoute(base + '/internal/store', form)).toBe(false);
  const req = {
    method: 'POST',
    url: base + '/api/note',
    headers: {
      host: runId + '.localhost:4175',
      origin: 'http://' + runId + '.localhost:4175',
      cookie: 'lesson-theme=dark',
    },
  };
  expect(lessonThemeRequestHeaders(req, form)).toEqual({ cookie: 'lesson-theme=dark' });
  expect(
    lessonThemeRequestHeaders(
      { ...req, headers: { ...req.headers, origin: 'http://evil.invalid' } },
      form,
    ),
  ).toEqual({});
  const weather = { workspaceId: 'future-weather', runId };
  const url = '/w/future-weather/' + runId + '/weather/clear';
  expect(nextDataRequest({ method: 'GET', url, headers: {} }, weather)).toEqual({
    stream: true,
    headers: {},
  });
  expect(nextDataRequest({ method: 'POST', url, headers: {} }, weather)).toBeUndefined();
  expect(
    nextDataRequest({ method: 'GET', url: url + '?arbitrary=1', headers: {} }, weather),
  ).toBeUndefined();
  expect(weatherRscRoute('weather/clear', '_rsc=abc', weather.workspaceId)).toBe(true);
  expect(weatherRscRoute('internal/store', '_rsc=abc', weather.workspaceId)).toBe(false);
});
