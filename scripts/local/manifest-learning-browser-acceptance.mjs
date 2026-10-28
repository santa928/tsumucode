import process from 'node:process';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { bridge } from './browser-test-bridge.mjs';
const engine = process.argv[2];
if (process.argv.length !== 3 || !['chromium', 'firefox', 'webkit'].includes(engine))
  throw Error('Expected one supported Native browser engine');
const servers = [await bridge(4173, 'web'), await bridge(4175, 'preview')];
try {
  for (const directory of [
    '/tmp/tsumucode-browser-cache',
    '/tmp/tsumucode-browser-config',
    '/tmp/tsumucode-browser-runtime',
  ])
    await mkdir(directory, { recursive: true, mode: 0o700 });
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config=playwright.learning-native.config.ts',
        '--project=' + engine,
        '--workers=1',
        '--retries=0',
        '--reporter=json',
        '--output=/tmp/native-learning-artifacts/' + engine,
      ],
      {
        stdio: 'inherit',
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(([key]) => key !== 'PLAYWRIGHT_JSON_OUTPUT_FILE'),
          ),
          BASE_PATH: '/',
          XDG_CACHE_HOME: '/tmp/tsumucode-browser-cache',
          XDG_CONFIG_HOME: '/tmp/tsumucode-browser-config',
          XDG_RUNTIME_DIR: '/tmp/tsumucode-browser-runtime',
        },
      },
    );
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(Error('Native learning browser interrupted'));
      else resolve(code ?? 1);
    });
  });
} finally {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
