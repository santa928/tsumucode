import { Buffer } from 'node:buffer';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import console from 'node:console';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Only fixed patterns are public; they are clues, not a verified cause.
const patterns = [
  ['module-resolution-pattern', /(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find module)/u],
  ['browser-executable-pattern', /Executable doesn't exist/u],
  ['permission-pattern', /(?:EACCES|permission denied)/iu],
  ['no-tests-pattern', /No tests found/u],
  ['connection-refused-pattern', /(?:ECONNREFUSED|ERR_CONNECTION_REFUSED)/u],
  ['timeout-pattern', /(?:TimeoutError|Test timeout of \d+ms exceeded)/u],
];
function readPrivate(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 65536) return null;
    const bytes = Buffer.alloc(65537);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    if (count !== stat.size || count > 65536) return null;
    return bytes.subarray(0, count).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined)
      try {
        closeSync(fd);
      } catch {
        /* private file */
      }
  }
}
export function classify(dockerLog, browserLog) {
  const lines = [dockerLog, browserLog].filter((value) => typeof value === 'string');
  return {
    docker: typeof dockerLog === 'string' ? 'available' : 'unknown',
    browser: typeof browserLog === 'string' ? 'available' : 'unknown',
    patterns: patterns
      .filter(([, expression]) => lines.some((value) => expression.test(value)))
      .map(([label]) => label),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result = classify(null, null);
  try {
    if (process.argv.length === 4)
      result = classify(readPrivate(process.argv[2]), readPrivate(process.argv[3]));
  } catch {
    /* fixed unknown only */
  }
  console.log('Private log pattern clues', JSON.stringify(result));
}
