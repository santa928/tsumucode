import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { constants, closeSync, fstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';

const directory = '/run/tsumucode-ci-diagnostics';
const ownerName = 'tsumucode-learning-ci';
const runIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:[1-9][0-9]{0,5}$/u;
const stages = ['create', 'start', 'output', 'wait', 'inspect', 'cleanup'];
const validStage = (index, phase, stage) => {
  if (index === 0) return phase === 'unknown' && stage === 'unknown';
  if (!Number.isInteger(index) || index < 1 || index > 3) return false;
  if (stage === 'fixture') return phase === 'unknown';
  return ['analysis', 'execution'].includes(phase) && stages.includes(stage);
};
let count = 0;
let capacityMarked = false;

/** CI-only: accept only a strong random identity and fixed course/installation. */
export function createPythonGradeCiObserver({
  enabled,
  owner,
  exerciseId,
  runId,
  schedule = setTimeout,
  cancel = clearTimeout,
  write,
}) {
  if (
    enabled !== true ||
    owner !== ownerName ||
    exerciseId !== 'python-basics-ch01-l02-e01' ||
    typeof runId !== 'string' ||
    !runIdPattern.test(runId)
  )
    return null;
  const runHash = createHash('sha256').update(runId).digest('hex');
  let active = true;
  let state = { case: 0, phase: 'unknown', stage: 'unknown' };
  const save =
    write ??
    ((name, body) => {
      if (count >= 24) {
        if (!capacityMarked) {
          capacityMarked = true;
          void writeFile(join(directory, 'grade-stage-capacity'), 'reached', {
            flag: 'wx',
            mode: 0o600,
          }).catch(() => {});
        }
        return;
      }
      count += 1;
      void writeFile(join(directory, name), JSON.stringify(body), {
        flag: 'wx',
        mode: 0o600,
      }).catch(() => {});
    });
  const timers = [5, 15, 25].map((at) => {
    const timer = schedule(() => {
      if (!active) return;
      try {
        save(`${runHash}-${at}.json`, { version: 1, runHash, at, ...state });
      } catch {
        /* diagnostics never change results */
      }
    }, at * 1000);
    timer?.unref?.();
    return timer;
  });
  return {
    mark(index, phase, stage) {
      if (!active) return;
      state = validStage(index, phase, stage)
        ? { case: index, phase, stage }
        : { case: 0, phase: 'unknown', stage: 'unknown' };
    },
    stop() {
      active = false;
      for (const timer of timers) cancel(timer);
    },
  };
}

/** A missing, forged or unreadable capacity marker is always unknown. */
export function readPythonGradeCiCapacity(dir = directory) {
  let fd;
  try {
    fd = openSync(
      join(dir, 'grade-stage-capacity'),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size !== 7) return 'unknown';
    const bytes = Buffer.alloc(8);
    return readSync(fd, bytes, 0, bytes.length, 0) === 7 &&
      bytes.subarray(0, 7).toString() === 'reached'
      ? 'reached'
      : 'unknown';
  } catch {
    return 'unknown';
  } finally {
    if (fd !== undefined)
      try {
        closeSync(fd);
      } catch {
        /* fixed unknown */
      }
  }
}

/** Validate filename, file kind, bounded bytes and every field before output. */
export async function readPythonGradeCiRecords(dir = directory) {
  let names;
  try {
    names = readdirSync(dir).filter((name) => /^[a-f0-9]{64}-(5|15|25)\.json$/u.test(name));
  } catch {
    return [];
  }
  if (names.length > 24) return [];
  const records = [];
  for (const name of names.sort()) {
    let fd;
    try {
      fd = openSync(
        join(dir, name),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > 512) continue;
      const bytes = Buffer.alloc(513);
      const length = readSync(fd, bytes, 0, bytes.length, 0);
      if (length !== stat.size || length > 512) continue;
      const record = JSON.parse(bytes.subarray(0, length).toString());
      const [id, atText] = name.slice(0, -5).split('-');
      if (
        !record ||
        Object.keys(record).sort().join(',') !== 'at,case,phase,runHash,stage,version' ||
        record.version !== 1 ||
        record.runHash !== id ||
        record.at !== Number(atText) ||
        !validStage(record.case, record.phase, record.stage)
      )
        continue;
      records.push({
        version: 1,
        runHash: record.runHash,
        at: record.at,
        case: record.case,
        phase: record.phase,
        stage: record.stage,
      });
    } catch {
      /* Omit unreadable and invalid records. */
    } finally {
      if (fd !== undefined)
        try {
          closeSync(fd);
        } catch {
          /* nothing to output */
        }
    }
  }
  return records;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href &&
  process.env.TSUMUCODE_PYTHON_CI_DIAGNOSTICS === '1' &&
  process.env.TSUMUCODE_LOCAL_OWNER === ownerName &&
  process.argv.length === 3 &&
  process.argv[2] === '--report'
) {
  const records = await readPythonGradeCiRecords();
  console.log(
    'Python grade CI summary',
    JSON.stringify({ records: records.length, capacity: readPythonGradeCiCapacity() }),
  );
  for (const record of records) console.log('Python grade CI stage', JSON.stringify(record));
}
