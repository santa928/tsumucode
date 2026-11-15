const { URL, process, console } = globalThis;
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const specHash = '1f36bb58a33602f93a11d3b7e6d0376f9a350729a62e6781b70eea8e4f945735';
const moduleHash = '0045edb75678d7b820a16d3a0ddbfcdc649afebe7aee8a463b6fbf5f2da47ea6';
const name = 'P6 new same-run synthetic Pages export imports into Local and runs the Python project';
export const hashesMatch = (spec, module) => spec === specHash && module === moduleHash;
export function isExpectedList(status, output) {
  if (status !== 0 || typeof output !== 'string') return false;
  const lines = output.split(/\r?\n/u);
  return lines.filter(line => line.includes(name)).length === 1 && lines.filter(line => line.trim() === 'Total: 1 test in 1 file').length === 1;
}
async function main() {
  try {
    const hash = value => createHash('sha256').update(value).digest('hex');
    const spec = hash(await readFile(new URL('./local-import.spec.ts', import.meta.url)));
    const module = hash(await readFile(new URL('./preview-diagnostic.mjs', import.meta.url)));
    if (!hashesMatch(spec, module)) throw Error();
    const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=list', '--config=/workspace/tests/observations/issue143/observation.config.ts'], {
      cwd: '/workspace', env: { ...process.env, OBSERVATION_PHASE: 'local', P6_RUN_EXPORT_SHA256: 'a'.repeat(64) }, encoding: 'utf8', timeout: 20000, maxBuffer: 1048576,
    });
    if (!isExpectedList(result.status, result.stdout)) throw Error();
    console.log('Local loader preflight passed');
  } catch { console.log('Local loader preflight failed'); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
