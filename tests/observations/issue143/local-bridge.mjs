const { process } = globalThis;
import { spawn } from 'node:child_process';
import { bridge } from '/workspace/scripts/local/browser-test-bridge.mjs';
const server = await bridge(4173, 'web');
try {
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=/workspace/tests/observations/issue143/observation.config.ts'], { stdio: 'inherit', env: { ...process.env, BASE_PATH: '/' } });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
