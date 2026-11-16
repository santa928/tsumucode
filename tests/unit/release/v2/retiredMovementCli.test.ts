// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runCli } from '../../../../scripts/release/v2/cli';

it('refuses the specified Source policy when its retirement evidence is absent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retired-cli-'));
  const output = path.join(root, 'preparation.json');
  try {
    await expect(
      runCli([
        'prepare',
        '--root',
        root,
        '--output',
        output,
        '--retirement-policy',
        'python-first-v1',
      ]),
    ).rejects.toThrow('Retired movement evidence is missing or changed');
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      runCli(['prepare', '--root', root, '--output', output, '--retirement-policy', 'unknown']),
    ).rejects.toThrow('Unknown retirement policy');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
