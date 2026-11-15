const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { fingerprint, readonlyMount, verify } = require('./check-dependencies.cjs');

test('dependency contents and actual readonly mount both must match', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oop-dependency-test-'));
  try {
    for (const file of ['@playwright/test/cli.js', 'vite/bin/vite.js', '@axe-core/playwright/package.json']) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'fixed-input');
    }
    fs.symlinkSync('vite/bin/vite.js', path.join(root, 'vite-link'));
    const expected = fingerprint(root);
    const readonly = '1 2 0:1 / /workspace/node_modules ro,relatime - ext4 /dev/x ro';
    const writable = '1 2 0:1 / /workspace/node_modules rw,relatime - ext4 /dev/x rw';
    assert.equal(verify(root, readonly, expected), true);
    fs.mkdirSync(path.join(root, '.vite-temp'));
    fs.writeFileSync(path.join(root, '.vite-temp', 'temporary'), 'allowed scratch');
    assert.equal(verify(root, readonly, expected), true);
    fs.symlinkSync('.vite-temp/temporary', path.join(root, 'scratch-link'));
    assert.throws(() => fingerprint(root));
    fs.unlinkSync(path.join(root, 'scratch-link'));
    assert.equal(verify(root, writable, expected), false);
    assert.equal(readonlyMount(''), false);
    assert.equal(readonlyMount(`${readonly}\n${readonly}`), false);
    assert.equal(verify(root, readonly, 'bad'), false);
    const target = path.join(root, 'vite/bin/vite.js');
    const originalMode = fs.statSync(target).mode & 0o7777;
    fs.chmodSync(target, originalMode ^ 0o100);
    assert.equal(verify(root, readonly, expected), false);
    fs.chmodSync(target, originalMode);
    assert.equal(verify(root, readonly, expected), true);
    fs.writeFileSync(path.join(root, 'vite/bin/vite.js'), 'changed');
    assert.equal(verify(root, readonly, expected), false);
    fs.unlinkSync(path.join(root, 'vite/bin/vite.js'));
    assert.throws(() => verify(root, readonly, expected));
    fs.symlinkSync('/etc/passwd', path.join(root, 'vite/bin/vite.js'));
    assert.throws(() => verify(root, readonly, expected));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
