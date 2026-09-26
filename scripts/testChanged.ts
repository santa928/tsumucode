/** Git差分と依存関係から対象testを選択する。教材の動的読込と設定変更は明示的に補う。 */
import { execFileSync, spawnSync } from 'node:child_process';

const base = process.env['TEST_BASE_SHA'] || 'HEAD';
const changedFiles = execFileSync('git', ['diff', '--name-only', base], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const untrackedFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
const files = [...new Set([...changedFiles, ...untrackedFiles])];
if (files.length === 0) {
  console.log('変更なし: testを実行しません。');
  process.exit(0);
}
const fullSuite = files.some((file) =>
  /^(package(?:-lock)?\.json|(?:vite|vitest)\.config\.ts|src\/test\/|tsconfig)/u.test(file),
);

/** npm execでtestを実行し、失敗を呼び出し元へそのまま返す。 */
function runTests(args: readonly string[]): void {
  const result = spawnSync('npm', ['exec', '--', 'vitest', ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (fullSuite) {
  console.log('依存・共通test設定の変更: Unit/Component/Content全件を実行');
  runTests(['run']);
} else {
  const selected = new Set(files);
  const dynamicDirectories = files.some((file) => /^(content\/|scripts\/content\/)/u.test(file))
    ? ['tests/content', 'scripts/content']
    : [];
  if (dynamicDirectories.length > 0) {
    const tracked = execFileSync('git', ['ls-files', ...dynamicDirectories], {
      encoding: 'utf8',
    });
    for (const file of tracked.trim().split('\n')) {
      if (/\.test\.tsx?$/u.test(file)) selected.add(file);
    }
  }
  if (files.some((file) => /^(\.github\/workflows\/|playwright.*\.ts)/u.test(file))) {
    selected.add('tests/pages-workflow.test.ts');
    selected.add('tests/unit/config/playwrightOutputIsolation.test.ts');
  }
  console.log(`変更関連test: ${base}との差分 ${String(files.length)} file`);
  // 動的読込test自身もrelatedへ渡し、import graphとの重複実行を避ける。
  runTests(['related', '--run', '--passWithNoTests', ...selected]);
}
