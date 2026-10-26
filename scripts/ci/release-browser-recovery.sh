#!/bin/sh
set -eu

# 既存の固定CI環境で、公開失敗から特定した検査だけを再実行する。
npm run content:compile
npm run build:app

verification_status=0
PLAYWRIGHT_JSON_OUTPUT_FILE=test-results/release-browser-recovery-summary.json \
  npm exec playwright test -- \
  tests/e2e/javascript-learning.spec.ts tests/e2e/python-oop.spec.ts \
  tests/e2e/slide-library.spec.ts tests/e2e/tailwind.spec.ts \
  tests/e2e/tailwind-foundations.spec.ts tests/e2e/tailwind-project.spec.ts \
  tests/e2e/visual-regression.spec.ts \
  --grep-invert '@visual-extended' \
  --grep '全Fixture|全9Fixture|通常UIで|python-oop-ch04-l01|Home経由で標準|Promiseの説明|制作の2ソース|course-map-(mobile|tablet)-portrait|exercise-(mobile|tablet)-portrait' \
  --workers=1 --retries=0 --trace=retain-on-failure --reporter=list,json \
  --output=test-results/release-browser-recovery-artifacts || verification_status=$?

# 失敗時も、CIの資源条件と実測を混同せず原本へ残す。
node --input-type=module <<'NODE'
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const record = {};
for (const name of ['memory.peak', 'memory.events', 'pids.peak', 'pids.events']) {
  record[name] = (await readFile(`/sys/fs/cgroup/${name}`, 'utf8')).trim();
}
await mkdir('test-results', { recursive: true });
await writeFile('test-results/release-browser-recovery-resources.json', JSON.stringify(record, null, 2) + '\n');
NODE

chmod -R a+rX test-results/release-browser-recovery-*
exit "$verification_status"
