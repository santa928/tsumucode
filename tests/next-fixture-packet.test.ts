// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, it } from 'vitest';
const exec = promisify(execFile);
it('uses compiler-selected course and Lesson identities without deriving fixed chapter names', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'next-packet-'));
  try {
    const exercise = path.join(
      root,
      'content/future-theme/chapters/chapter/lessons/unit/exercises/exercise',
    );
    await mkdir(exercise, { recursive: true });
    await writeFile(
      path.join(exercise, 'exercise.yaml'),
      'fixtures:\n  - id: solution\n    expectedStatus: pass\n    expectedFeedbackRuleIds: []\n    files:\n      - path: app/page.tsx\n        source: fixture.tsx\nvalidationRules: []\n',
    );
    await writeFile(
      path.join(exercise, 'fixture.tsx'),
      'export default function Page(){ return <h1>Hello</h1>; }',
    );
    const script = path.resolve('scripts/local/next-fixture-packet.mjs');
    const result = await exec(
      process.execPath,
      [script, 'next-ch01-l01-e01', 'future-theme', 'unit', 'exercise'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(JSON.parse(result.stdout) as unknown).toMatchObject([
      {
        id: 'solution',
        expectedStatus: 'pass',
        files: { 'app/page.tsx': 'export default function Page(){ return <h1>Hello</h1>; }' },
      },
    ]);
    await expect(
      exec(process.execPath, [script, 'next-ch01-l01-e01', '../outside', 'unit', 'exercise'], {
        cwd: root,
      }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
