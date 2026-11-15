import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

test('the actual controller identity expression rejects wrong fixed image and version', () => {
  const root = new URL(
    '../../../.github/workflows/python-grade-observer-probe.yml',
    import.meta.url,
  );
  const workflow = readFileSync(fileURLToPath(root), 'utf8');
  const expression = workflow.match(
    /docker exec "\$controller" node --input-type=module -e '([^']+)'/u,
  )?.[1];
  assert.ok(expression);
  const dir = mkdtempSync(join(tmpdir(), 'probe-identity-'));
  try {
    const path = join(dir, 'protocol.mjs');
    const source = expression.replace(
      '"/app/protocol.mjs"',
      JSON.stringify(pathToFileURL(path).href),
    );
    assert.notEqual(source, expression);
    const check = (version, image) => {
      writeFileSync(
        path,
        `export const PYTHON_VERSION=${JSON.stringify(version)}; export const PYTHON_IMAGE=${JSON.stringify(image)};`,
      );
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
        encoding: 'utf8',
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.stderr, '');
      return result.status;
    };
    const image =
      'python:3.14.2-slim-bookworm@sha256:e87711ef5c86aaeaa7031718a69db79d334d94c545c709583f651b8185870941';
    assert.equal(check('3.14.2', image), 0);
    assert.equal(check('3.14.3', image), 1);
    assert.equal(check('3.14.2', 'wrong-image'), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
