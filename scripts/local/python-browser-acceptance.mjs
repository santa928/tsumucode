import process from 'node:process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { bridge } from './browser-test-bridge.mjs';

// 作者/CI専用。製品と同じloopback Originから実CPythonを操作する。
const server = await bridge(4173, 'web');
try {
  const child = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config=playwright.python-local.config.ts',
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit', env: { ...process.env, BASE_PATH: '/' } },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  // 終了済みchildのcgroup記録だけを保存し、Sourceや認証値は収集しない。
  try {
    const resources = Object.fromEntries(
      await Promise.all(
        ['memory.events', 'memory.peak', 'memory.current'].map(async (name) => [
          name,
          await readFile('/sys/fs/cgroup/' + name, 'utf8').then(
            (value) => value.slice(0, 2048),
            () => null,
          ),
        ]),
      ),
    );
    await mkdir('test-results/local-python', { recursive: true });
    await writeFile('test-results/local-python/runtime-resource.json', JSON.stringify(resources));
  } catch {
    process.stderr.write('Python resource diagnostics unavailable\n');
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
