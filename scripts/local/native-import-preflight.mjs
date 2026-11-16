import { lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

// image内の実spec/configから静的依存を読む。Browser・学習stackは起動しない。
for (const file of ['playwright.learning-native.config.ts', 'tests/local/manifest-next-learning.spec.ts', 'playwright.python-local.config.ts', 'tests/e2e/python-published-fixtures.spec.ts']) {
  if (!lstatSync(file).isFile()) throw Error('Missing baked Native test entry: ' + file);
}
// Check the Python fixture entry as well as Native manifests. The spec exposes
// a sentinel for an all-draft catalog; empty collection still fails.
for (const [config, spec] of [
  ['playwright.learning-native.config.ts'],
  ['playwright.python-local.config.ts', 'tests/e2e/python-published-fixtures.spec.ts'],
]) {
  const result = spawnSync(process.execPath, [
    'node_modules/@playwright/test/cli.js', 'test',
    `--config=${config}`, ...(spec ? [spec] : []), '--list',
    ...(spec ? [] : ['--pass-with-no-tests']), '--workers=1', '--retries=0',
    '--reporter=list', '--output=/tmp/native-import-results',
  ], { stdio: 'inherit', env: { ...process.env, PW_TEST_CACHE_DIR: '/tmp/native-import-cache' } });
  if (result.error) throw result.error;
  const status = result.signal ? 1 : (result.status ?? 1);
  if (status !== 0) { process.exitCode = status; break; }
}
