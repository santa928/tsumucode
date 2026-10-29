import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
/** Sanitized release metadata only: immutable JSON readable by the host artifact uploader. */
export async function writeProtocolJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
}
