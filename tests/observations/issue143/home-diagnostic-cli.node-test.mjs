const { URL, process, Buffer } = globalThis;
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./home-diagnostic.mjs', import.meta.url));
async function withTemporaryDirectory(run) {
  const dir = await mkdtemp(join(tmpdir(), 'home-diagnostic-test-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const invoke = path => spawnSync(process.execPath, [cli, path], { encoding: 'utf8' });

test('CLI prints only known labels even if error contents contain private data', async () => {
  await withTemporaryDirectory(async dir => {
    const file = join(dir, 'input.json');
    const item = { title: 'course resumes the saved exercise and source', file: 'home-resume.pw-spec.mjs', tests: [{
      projectName: 'chromium', expectedStatus: 'passed', results: [{ retry: 0, status: 'failed',
        errorLocation: { file: 'home-resume.pw-spec.mjs', line: 30 },
        errors: [{ message: 'PRIVATE_MARKER_secret_url_code' }],
      }],
    }] };
    await writeFile(file, JSON.stringify({ suites: [{ specs: [item] }] }));
    const result = invoke(file);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /home course status=failed expected=passed stage=resume-link-href/);
    assert.doesNotMatch(result.stdout, /PRIVATE_MARKER|secret|url_code/);
  });
});
test('CLI refuses missing, malformed, oversized and symlink input without printing contents', async () => {
  await withTemporaryDirectory(async dir => {
    const malformed = join(dir, 'malformed.json'), large = join(dir, 'large.json'), link = join(dir, 'link.json');
    await writeFile(malformed, 'PRIVATE_MARKER_not_json');
    await writeFile(large, Buffer.alloc(4 * 1024 * 1024 + 1));
    await symlink(malformed, link);
    for (const file of [join(dir, 'missing.json'), malformed, large, link]) {
      const result = invoke(file);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, 'home-diagnostic report-unavailable\n');
    }
  });
});
