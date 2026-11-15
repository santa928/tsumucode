const { process, URL, console } = globalThis;
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { previewLines } from './preview-diagnostic.mjs';

async function main() {
  let file;
  try {
    if (process.argv.length !== 3) throw Error();
    file = await open(process.argv[2], constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 4096) throw Error();
    const body = await file.readFile('utf8');
    const sha = createHash('sha256').update(await readFile(new URL('./local-import.pw-spec.ts', import.meta.url))).digest('hex');
    for (const line of previewLines(JSON.parse(body), sha)) console.log(line);
  } catch { console.log('preview-diagnostic unavailable'); }
  finally { await file?.close(); }
}
void main().catch(() => console.log('preview-diagnostic unavailable'));
