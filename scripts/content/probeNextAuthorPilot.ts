/** 固定Next作者Starterを新しい専用tmpへ展開する。install/build/serverはDockerで別に実行する。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const fixtureSchema = z
  .object({
    manifest: z
      .object({
        name: z.literal('tsumucode-next-author-pilot'),
        version: z.literal('0.0.0'),
        private: z.literal(true),
        type: z.literal('module'),
        engines: z.object({ node: z.literal('24.18.0') }).strict(),
        scripts: z
          .object({
            dev: z.literal('next dev'),
            build: z.literal('next build'),
            start: z.literal('next start'),
          })
          .strict(),
        dependencies: z
          .object({
            next: z.literal('16.3.8'),
            react: z.literal('19.2.7'),
            'react-dom': z.literal('19.2.7'),
          })
          .strict(),
        devDependencies: z
          .object({
            typescript: z.literal('6.0.3'),
            '@types/node': z.literal('24.13.2'),
            '@types/react': z.literal('19.2.17'),
            '@types/react-dom': z.literal('19.2.3'),
          })
          .strict(),
      })
      .strict(),
    files: z
      .object({
        'app/layout.tsx': z.string(),
        'app/page.tsx': z.string(),
        'app/globals.css': z.string(),
        'app/api/question/route.ts': z.string(),
        'next.config.mjs': z.string(),
        'tsconfig.json': z.string(),
      })
      .strict(),
  })
  .strict();

/** 同じhashの固定原稿とlockfileだけを新規tmpへ出し、他Workspaceを上書きしない。 */
async function prepare(): Promise<void> {
  const fixture = fixtureSchema.parse(
    JSON.parse(await readFile('scripts/content/fixtures/next-author-pilot.json', 'utf8')),
  );
  assert.equal(process.versions.node, fixture.manifest.engines.node);
  const lock = await readFile('scripts/content/fixtures/next-author-pilot.lock.json', 'utf8');
  const lockSchema = z
    .object({ lockfileVersion: z.literal(3), packages: z.record(z.string(), z.unknown()) })
    .loose();
  const parsedLock = lockSchema.parse(JSON.parse(lock));
  const lockedRoot = z
    .object({
      dependencies: z.record(z.string(), z.string()),
      devDependencies: z.record(z.string(), z.string()),
      engines: z.object({ node: z.string() }),
    })
    .loose()
    .parse(parsedLock.packages['']);
  assert.deepEqual(lockedRoot.dependencies, fixture.manifest.dependencies);
  assert.deepEqual(lockedRoot.devDependencies, fixture.manifest.devDependencies);
  assert.deepEqual(lockedRoot.engines, fixture.manifest.engines);
  const outputRoot = '/evidence/next-author-pilot';
  await mkdir(outputRoot, { recursive: true });
  const sourceRoot = await mkdtemp(path.join(outputRoot, 'source-'));
  const files = {
    ...fixture.files,
    'package.json': `${JSON.stringify(fixture.manifest, null, 2)}\n`,
    'package-lock.json': lock,
  };
  const hashes: Record<string, string> = {};
  for (const [name, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(sourceRoot, name)), { recursive: true });
    await writeFile(path.join(sourceRoot, name), source);
    hashes[name] = createHash('sha256').update(source).digest('hex');
  }
  const report = {
    scope: 'fixed-trusted-author-next-only',
    node: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    sourceRoot,
    files: hashes,
    installed: false,
    started: false,
    productRuntime: false,
  };
  await writeFile(path.join(outputRoot, 'prepared.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
await prepare();
