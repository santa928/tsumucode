import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { bridge } from '/workspace/scripts/local/browser-test-bridge.mjs';
import { createPrivateLog } from './private-log.mjs';
import { markOnSpawn, markProbeStage } from './probe-stage-lib.mjs';

let server;
let outcome = 'failed';
let privateLog;
try {
  markProbeStage('runner-enter');
  privateLog = createPrivateLog('/exchange/browser-private.log');
  server = await bridge(4173, 'web');
  markProbeStage('bridge-ready');
  const child = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config=/workspace/tests/observations/python-grade-probe/playwright.config.ts',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BASE_PATH: '/' } },
  );
  markOnSpawn(child);
  let logError = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('error', () => {
      logError = true;
    });
    stream.on('data', (chunk) => {
      try {
        privateLog.write(chunk);
      } catch {
        logError = true;
      }
    });
  }
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (value) => resolve(value ?? 1));
  });
  if (code === 0 && !logError) outcome = 'passed';
} catch {
  // Raw browser errors and data are private; report only this fixed category.
} finally {
  try {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  } catch {
    outcome = 'failed';
  }
  try {
    privateLog?.close();
  } catch {
    outcome = 'failed';
  }
  console.log('Normal grade probe', outcome);
  if (outcome !== 'passed') process.exitCode = 1;
}
