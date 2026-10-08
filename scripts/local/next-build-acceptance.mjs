import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { readFile, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout, clearTimeout } from 'node:timers';
import { parse } from 'yaml';

// 作者専用のproduction build。learnerの設定や資源を変更せず、正解と境界違反を実Nextで検査する。
const cases = [
  ['next-ch02-l01', 'solution', undefined],
  ['next-ch02-l02', 'solution', undefined],
  ['next-ch02-l02', 'server-hook', /useState/u],
  ['next-ch02-l02', 'client-node', /node:fs/u],
  ['next-ch02-l02', 'function-prop', /not assignable|Functions cannot be passed/u],
];
const root = '/opt/workspace';
for (const [lesson, fixtureId, expectedDiagnostic] of cases) {
  // 自分の作者用tmpfsの内容だけを更新し、hostやlearnerのSourceには触れない。
  for (const name of ['app', '.next', 'node_modules', 'next-env.d.ts', 'tsconfig.tsbuildinfo'])
    await rm(join(root, name), { recursive: true, force: true });
  const sourcePath = `content/next/chapters/next-ch02/lessons/${lesson}/exercises/${lesson}-e01/exercise.yaml`;
  const exercise = parse(await readFile(sourcePath, 'utf8'));
  const fixture = exercise.fixtures.find(({ id }) => id === fixtureId);
  assert.ok(fixture);
  for (const file of fixture.files) {
    const destination = join(root, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(join(dirname(sourcePath), file.source)));
  }
  await symlink('/opt/next/node_modules', `${root}/node_modules`);
  for (const name of ['package.json', 'tsconfig.json'])
    await writeFile(`${root}/${name}`, await readFile(`/opt/next/${name}`));
  await writeFile(
    `${root}/next.config.mjs`,
    `export default {
  devIndicators: false,
  poweredByHeader: false,
  experimental: { cpus: 1 },
};
`,
  );
  const child = spawn(
    process.execPath,
    ['/opt/next/node_modules/next/dist/bin/next', 'build', '--webpack'],
    {
      cwd: root,
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: root,
        LANG: 'C.UTF-8',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      output = (output + data).slice(-40000);
    });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 120000);
  let code;
  try {
    [code] = await once(child, 'exit');
  } finally {
    clearTimeout(deadline);
  }
  assert.equal(code === 0, expectedDiagnostic === undefined, output);
  if (expectedDiagnostic) assert.match(output, expectedDiagnostic);
  console.log(
    JSON.stringify({
      lesson,
      fixture: fixtureId,
      buildExit: code,
      diagnostic: expectedDiagnostic ? output.slice(-2000) : 'production build成功',
    }),
  );
}
