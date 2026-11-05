import { lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

// image内の実spec/configから静的依存を読む。Browser・学習stackは起動しない。
for (const file of ['playwright.learning-native.config.ts', 'tests/local/manifest-next-learning.spec.ts']) {
  if (!lstatSync(file).isFile()) throw Error('Missing baked Native test entry: ' + file);
}
const result = spawnSync(process.execPath, [
  'node_modules/@playwright/test/cli.js', 'test',
  '--config=playwright.learning-native.config.ts', '--list',
  // 通常PRには同runのplanがない。空collectionだけを許し、import失敗は拒否する。
  '--pass-with-no-tests', '--workers=1', '--retries=0',
  '--reporter=list', '--output=/tmp/native-import-results',
], { stdio: 'inherit', env: { ...process.env, PW_TEST_CACHE_DIR: '/tmp/native-import-cache' } });
if (result.error) throw result.error;
process.exitCode = result.signal ? 1 : (result.status ?? 1);
