import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const specHash = '482cd0e6ddcd50022b81fadf8b4df3d644e60454fb4b5f28673d86746be45e37';
const previewHash = 'ecf574b68b1a42b652bc6bd16a4d1e69f9e6f964ec8c515ba5442f566d38d923';
const maxBytes = 1048576;
const patterns = [
  ['pattern-seen-async-require', /ERR_REQUIRE_ASYNC_MODULE|require\(\) cannot be used on an ESM graph with top-level await/],
  ['pattern-seen-esm-require', /\bERR_REQUIRE_ESM\b/],
  ['pattern-seen-module-not-found', /\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)\b/],
  ['pattern-seen-no-tests', /\bNo tests found\b/],
  ['pattern-seen-module-syntax', /Cannot use import statement outside a module|Cannot use 'import\.meta' outside a module|Unexpected token 'export'/],
];
export const classifySources = (spec, preview) => spec === specHash && preview === previewHash;
export function classifyStartup(text) {
  const matched = patterns.filter(([, pattern]) => pattern.test(text));
  return matched.length === 0 ? 'no-whitelisted-pattern' : matched.length === 1 ? matched[0][0] : 'pattern-seen-multiple';
}
const sha = data => createHash('sha256').update(data).digest('hex');
async function main() {
  let file;
  try {
    if (process.argv.length !== 3) throw Error();
    file = await open(process.argv[2], constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw Error();
    const spec = sha(await readFile(new URL('./local-import.spec.ts', import.meta.url)));
    const preview = sha(await readFile(new URL('./preview-diagnostic.mjs', import.meta.url)));
    if (!classifySources(spec, preview)) { console.log('startup-diagnostic source-mismatch'); return; }
    const buffer = Buffer.alloc(maxBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > maxBytes) throw Error();
    console.log(`startup-diagnostic ${classifyStartup(buffer.subarray(0, total).toString('utf8'))}`);
  } catch { console.log('startup-diagnostic unavailable'); }
  finally { await file?.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => console.log('startup-diagnostic unavailable'));
}
