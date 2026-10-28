import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { compileContent } from '../../content/compile';
import { buildInventory } from './inventory';
import { hashValue } from './identity';
import { readLegacyEvidence } from './legacy';
import { planRelease } from './plan';
import { compareLegacy } from './shadow';

/** Report generation never grants publication approval or modifies historical evidence. */
export async function runCli(args: readonly string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command !== 'shadow') throw new Error('Unknown release v2 command');
  const { values } = parseArgs({
    args: rest,
    options: { root: { type: 'string' }, output: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  if (!values.output) throw new Error('--output is required');
  const output = path.resolve(values.output);
  try {
    await lstat(output);
    throw new Error('Output already exists');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const root = path.resolve(values.root ?? process.cwd());
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'release-shadow-'));
  try {
    const compilation = await compileContent({
      sourceRoot: path.join(root, 'content'),
      outputRoot: path.join(temporary, 'generated/content'),
      checkOnly: false,
      publication: 'public',
    });
    const inventory = buildInventory(compilation.compilations);
    const legacy = await readLegacyEvidence(
      root,
      inventory.courses
        .filter((course) => course.publicationStatus === 'published')
        .map((course) => course.id),
    );
    const report = {
      schemaVersion: 1,
      status: 'shadow-only',
      inventory,
      inventoryDigest: hashValue(inventory),
      plan: planRelease(inventory),
      shadow: compareLegacy(inventory, legacy),
    };
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write((error instanceof Error ? error.message : 'Release v2 failed') + '\n');
    process.exitCode = 1;
  });
}
