import { Buffer } from 'node:buffer';
import { closeSync, constants, openSync, writeSync } from 'node:fs';

// Private temporary data is bounded and never printed or uploaded.
export function createPrivateLog(path) {
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let remaining = 65536;
  return {
    write(chunk) {
      if (!Buffer.isBuffer(chunk)) throw new Error('invalid private chunk');
      const count = Math.min(remaining, chunk.length);
      if (count > 0) {
        const written = writeSync(fd, chunk, 0, count);
        if (written !== count) throw new Error('private write unavailable');
        remaining -= count;
      }
    },
    close() {
      closeSync(fd);
    },
  };
}
