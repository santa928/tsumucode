import process from 'node:process';
import { spawn } from 'node:child_process';
import { bridge } from './browser-test-bridge.mjs';

// 作者/CI専用。製品と同じloopback Originから実CPythonを操作する。
const server = await bridge(4173, 'web');
try {
  const child = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.python-local.config.ts'],
    { stdio: 'inherit', env: { ...process.env, BASE_PATH: '/' } },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
