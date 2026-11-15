import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('./local-diagnostic.mjs', import.meta.url));
async function withTemporaryDirectory(run) {
  const dir = await mkdtemp(join(tmpdir(), 'local-diagnostic-test-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const invoke = path => spawnSync(process.execPath, [cli, path], { encoding: 'utf8' });

test('CLI prints only fixed identifiers when private data occurs in a report', async () => {
  await withTemporaryDirectory(async dir => {
    const file = join(dir, 'input.json');
    const item = { title: 'P6 new same-run synthetic Pages export imports into Local and runs the Python project', file: 'local-import.spec.ts', tests: [{
      projectName: 'chromium', expectedStatus: 'passed', results: [{ retry: 0, status: 'failed',
        errorLocation: { file: 'local-import.spec.ts', line: 76 },
        errors: [{ message: 'PRIVATE_MARKER_nonpublic_url_code' }],
      }],
    }] };
    await writeFile(file, JSON.stringify({ suites: [{ specs: [item] }] }));
    const result = invoke(file);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'local p6 status=failed expected=passed stage=runtime-version\n');
    assert.doesNotMatch(result.stdout, /PRIVATE_MARKER|nonpublic|url_code/);
  });
});
test('CLI refuses missing, malformed, oversized and symlink input without revealing it', async () => {
  await withTemporaryDirectory(async dir => {
    const bad = join(dir, 'bad.json'), large = join(dir, 'large.json'), link = join(dir, 'link.json');
    await writeFile(bad, 'PRIVATE_MARKER_not_json');
    await writeFile(large, Buffer.alloc(4 * 1024 * 1024 + 1));
    await symlink(bad, link);
    for (const file of [join(dir, 'missing.json'), bad, large, link]) {
      const result = invoke(file);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, 'local-diagnostic report-unavailable\n');
    }
  });
});
