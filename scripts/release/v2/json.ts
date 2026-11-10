import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
/** Sanitized release metadata only: immutable JSON readable by the host artifact uploader. */
export async function writeProtocolJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
}

/** 準備結果を配信・記録側と同じ上限内で保存し、全フィールドを保持する。 */
export async function writePreparationJson(file: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(serialized) > 4 * 1024 * 1024)
    throw new Error('Oversized preparation metadata');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serialized, { flag: 'wx', mode: 0o644 });
}
