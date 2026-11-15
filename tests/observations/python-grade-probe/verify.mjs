import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';

const hex = /^[a-f0-9]{64}$/u;
const phase = ['analysis', 'execution'];
const stage = ['create', 'start', 'output', 'wait', 'inspect', 'cleanup'];
const valid = (row) =>
  row &&
  typeof row === 'object' &&
  Object.keys(row).sort().join(',') === 'at,case,phase,runHash,stage,version' &&
  row.version === 1 &&
  typeof row.runHash === 'string' &&
  hex.test(row.runHash) &&
  [5, 15, 25].includes(row.at) &&
  Number.isInteger(row.case) &&
  row.case >= 0 &&
  row.case <= 3 &&
  ((row.case === 0 && row.phase === 'unknown' && row.stage === 'unknown') ||
    (row.case >= 1 && row.phase === 'unknown' && row.stage === 'fixture') ||
    (row.case >= 1 && phase.includes(row.phase) && stage.includes(row.stage)));

/** Return only finite categories; never echo the input or run identity. */
export function classify(hash, report) {
  const invalid = { status: 'invalid', capacity: 'unknown', samples: [] };
  if (
    typeof hash !== 'string' ||
    !hex.test(hash) ||
    typeof report !== 'string' ||
    Buffer.byteLength(report) > 65536
  )
    return invalid;
  if (!report.trim()) return { status: 'unknown', capacity: 'unknown', samples: [] };
  try {
    const lines = report.trim().split('\n');
    const prefix = 'Python grade CI summary ';
    if (!lines[0]?.startsWith(prefix)) return invalid;
    const summary = JSON.parse(lines[0].slice(prefix.length));
    if (
      !summary ||
      Object.keys(summary).sort().join(',') !== 'capacity,records' ||
      !Number.isInteger(summary.records) ||
      summary.records < 0 ||
      summary.records > 24 ||
      !['unknown', 'reached'].includes(summary.capacity)
    )
      return invalid;
    const rows = lines.slice(1).map((line) => {
      const label = 'Python grade CI stage ';
      if (!line.startsWith(label)) throw Error('invalid');
      return JSON.parse(line.slice(label.length));
    });
    if (rows.length !== summary.records || !rows.every(valid)) return invalid;
    const selected = rows.filter((row) => row.runHash === hash);
    if (new Set(selected.map((row) => row.at)).size !== selected.length) return invalid;
    const samples = selected
      .map(({ at, case: caseNumber, phase: phaseName, stage: stageName }) => ({
        at,
        case: caseNumber,
        phase: phaseName,
        stage: stageName,
      }))
      .sort((a, b) => a.at - b.at);
    return { status: samples.length ? 'observed' : 'unknown', capacity: summary.capacity, samples };
  } catch {
    return invalid;
  }
}

function boundedFile(path, limit) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) return null;
    const bytes = Buffer.alloc(limit + 1);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    return count === stat.size && count <= limit ? bytes.subarray(0, count).toString('utf8') : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined)
      try {
        closeSync(fd);
      } catch {
        /* no private output */
      }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result = { status: 'invalid', capacity: 'unknown', samples: [] };
  try {
    if (process.argv.length !== 4) throw Error();
    const body = boundedFile(process.argv[2], 256);
    const report = boundedFile(process.argv[3], 65536);
    if (body === null) {
      result = { status: 'unknown', capacity: 'unknown', samples: [] };
    } else {
      const identity = JSON.parse(body);
      if (!identity || Object.keys(identity).join(',') !== 'runHash') throw Error();
      result = classify(identity.runHash, report ?? '');
    }
  } catch {
    /* Report only a fixed invalid status. */
  }
  console.log('Python grade observer probe', JSON.stringify(result));
  if (result.status !== 'observed') process.exitCode = 2;
}
