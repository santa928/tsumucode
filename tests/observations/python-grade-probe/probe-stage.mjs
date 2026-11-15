import { Buffer } from 'node:buffer';
import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';

// Missing markers are unknown: filesystem writes and collection may fail or race.
const stages = Object.freeze([
  'runner-enter',
  'bridge-ready',
  'playwright-spawned',
  'spec-started',
  'navigation-complete',
  'editor-ready',
  'fixture-set',
  'grade-clicking',
  'grade-accepted',
  'identity-saved',
  'dialog-visible',
  'checks-passed',
]);
export async function writeStage(dir, stage) {
  if (!stages.includes(stage)) return false;
  try {
    await writeFile(join(dir, `stage-${stage}`), 'reached\n', { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
// Do not await diagnostics in the grade path and never change grading or its deadlines.
export function markProbeStage(stage) {
  void writeStage('/exchange', stage);
}
export function markOnSpawn(child, mark = markProbeStage) {
  child.once('spawn', () => mark('playwright-spawned'));
}
function isReached(dir, stage) {
  let fd;
  try {
    fd = openSync(
      join(dir, `stage-${stage}`),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size !== 8) return false;
    const bytes = Buffer.alloc(9);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    return count === 8 && bytes.subarray(0, count).toString('utf8') === 'reached\n';
  } catch {
    return false;
  } finally {
    if (fd !== undefined)
      try {
        closeSync(fd);
      } catch {
        /* unknown */
      }
  }
}
export function readStages(dir) {
  return Object.fromEntries(
    stages.map((stage) => [stage, isReached(dir, stage) ? 'reached' : 'unknown']),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result =
    process.argv.length === 3 && process.argv[2]
      ? readStages(process.argv[2])
      : Object.fromEntries(stages.map((stage) => [stage, 'unknown']));
  console.log('Fixed probe stage observations', JSON.stringify(result));
}
