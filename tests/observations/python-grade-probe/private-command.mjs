import process from 'node:process';
import console from 'node:console';
import { spawn } from 'node:child_process';
import { createPrivateLog } from './private-log.mjs';

let log;
let outcome = 'failed';
try {
  const [, , path, command, ...args] = process.argv;
  if (!path || !command) throw new Error('invalid command');
  log = createPrivateLog(path);
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let logError = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      try {
        log.write(chunk);
      } catch {
        logError = true;
      }
    });
    stream.on('error', () => {
      logError = true;
    });
  }
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (value) => resolve(value ?? 1));
  });
  if (code === 0 && !logError) outcome = 'passed';
} catch {
  // Only a fixed category is public.
} finally {
  try {
    log?.close();
  } catch {
    outcome = 'failed';
  }
  console.log('Private command', outcome);
  if (outcome !== 'passed') process.exitCode = 1;
}
