#!/bin/sh
set -eu

# 共有端末の他作業へ干渉せず、固定Docker内で制作と既存下書きの互換性を確認する。
npm run content:compile
npm run build:app

verification_status=0
PLAYWRIGHT_JSON_OUTPUT_FILE=test-results/tailwind-project-summary.json \
  npm exec playwright test -- tests/e2e/tailwind-project.spec.ts \
  --workers=1 --retries=0 --reporter=list,json \
  --output=test-results/tailwind-project-artifacts || verification_status=$?
PLAYWRIGHT_JSON_OUTPUT_FILE=test-results/tailwind-migration-summary.json \
  npm exec playwright test -- tests/e2e/tailwind-foundations.spec.ts \
  --project=chromium --grep '旧revision' --workers=1 --retries=0 --reporter=list,json \
  --output=test-results/tailwind-migration-artifacts || verification_status=$?

# 上限値と実使用量を区別するため、ブラウザー検証の失敗時もcgroupの値を残す。
node --input-type=module <<'NODE'
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const record = {};
for (const name of ['memory.peak', 'memory.events', 'pids.peak', 'pids.events']) {
  try {
    record[name] = (await readFile(`/sys/fs/cgroup/${name}`, 'utf8')).trim();
  } catch (error) {
    record[name] = String(error);
  }
}
await mkdir('test-results', { recursive: true });
await writeFile('test-results/tailwind-resources.json', JSON.stringify(record, null, 2) + '\n');
NODE
exit "$verification_status"
