// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
// 合成commandで順序と失敗伝播だけを検査する。実gateの成功証拠にはしない。
it.each([0, 41])('typecheck exit %iを後段の品質gateへ正しく伝える', async (exit) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'prepush-type-order-'));
  try {
    await mkdir(path.join(directory, 'scripts'));
    await mkdir(path.join(directory, 'node_modules/.bin'), { recursive: true });
    await mkdir(path.join(directory, 'bin'));
    const script = path.join(directory, 'scripts/checkBeforePush.sh');
    await writeFile(script, await readFile('scripts/checkBeforePush.sh'));
    const tsx = path.join(directory, 'node_modules/.bin/tsx');
    await writeFile(tsx, '#!/bin/sh\nprintf "%s\\n" "$2" >> "$PREFLIGHT_TRACE"\n');
    await chmod(tsx, 0o700);
    const npm = path.join(directory, 'bin/npm');
    await writeFile(npm, '#!/bin/sh\nprintf "npm %s\\n" "$*" >> "$PREFLIGHT_TRACE"\nif [ "$*" = "run typecheck" ]; then exit "$TYPECHECK_EXIT"; fi\n');
    await chmod(npm, 0o700);
    const trace = path.join(directory, 'trace');
    const running = exec('sh', [script, 'a'.repeat(40), '--release'], {
      cwd: directory,
      env: { ...process.env, PATH: path.join(directory, 'bin') + path.delimiter + (process.env['PATH'] ?? ''), PREFLIGHT_TRACE: trace, TYPECHECK_EXIT: String(exit) },
    });
    if (exit) await expect(running).rejects.toMatchObject({ code: exit });
    else await running;
    const expected = ['prepare', 'npm run content:provenance', 'npm run typecheck'];
    if (!exit) expected.push('npm run check:release', 'finish');
    expect((await readFile(trace, 'utf8')).trim().split('\n')).toEqual(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
