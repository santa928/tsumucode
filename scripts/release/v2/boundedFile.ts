import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

/** Nonblocking no-follow fd, bounded allocation, and growth/shrink rejection. */
export async function readBoundedRegularFile(file: string, limit: number): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > limit)
      throw new Error('Invalid bounded file');
    const bytes = Buffer.alloc(stat.size);
    let position = 0;
    while (position < bytes.length) {
      const { bytesRead } = await handle.read(bytes, position, bytes.length - position, position);
      if (bytesRead === 0) throw new Error('Bounded file shrank while reading');
      position += bytesRead;
    }
    const extra = Buffer.alloc(1);
    if ((await handle.read(extra, 0, 1, position)).bytesRead !== 0)
      throw new Error('Bounded file grew while reading');
    return bytes;
  } finally {
    await handle.close();
  }
}
