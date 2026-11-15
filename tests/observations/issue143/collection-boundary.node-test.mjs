import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { URL } from 'node:url';

const directory = new URL('./', import.meta.url);
const expected = [
  'check-report.node-test.mjs',
  'collection-boundary.node-test.mjs',
  'controller-image-diagnostic.node-test.mjs',
  'home-diagnostic-cli.node-test.mjs',
  'home-diagnostic.node-test.mjs',
  'identity-http-diagnostic.node-test.mjs',
  'identity-preflight.node-test.mjs',
  'loader-list-check.node-test.mjs',
  'local-diagnostic-cli.node-test.mjs',
  'local-diagnostic.node-test.mjs',
  'preview-diagnostic-cli.node-test.mjs',
  'preview-diagnostic-compat.node-test.mjs',
  'preview-diagnostic.node-test.mjs',
  'startup-diagnostic-cli.node-test.mjs',
  'startup-diagnostic.node-test.mjs',
];
export function selectedSuites(workflow) {
  const result = [];
  for (const line of workflow.split('\n')) {
    if (!line.includes('node --test ')) continue;
    for (const match of line.matchAll(/\/([\w-]+\.node-test\.mjs)/gu)) result.push(match[1]);
  }
  return result.sort();
}
test('all and only Node suites remain explicitly scheduled', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/issue143-synthetic-observation.yml', import.meta.url), 'utf8');
  assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith('.node-test.mjs')).sort(), expected);
  assert.deepEqual(selectedSuites(workflow), expected);
  for (const name of expected) {
    assert.notDeepEqual(selectedSuites(workflow.replace('/' + name, '/omitted')), expected);
  }
});
test('Playwright targets remain explicit and outside the Vitest default suffix', async () => {
  const config = await readFile(new URL('./observation.config.ts', import.meta.url), 'utf8');
  for (const name of ['pages-export.pw-spec.ts', 'home-resume.pw-spec.mjs', 'local-import.pw-spec.ts']) {
    assert.ok(config.includes("'" + name + "'"));
    assert.doesNotMatch(name, /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u);
  }
});
