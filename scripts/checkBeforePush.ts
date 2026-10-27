/** pushするcommitと依存を固定し、CIと同じ検証を省略せず直列実行する。 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const PackageSchema = z.object({
  engines: z.object({ node: z.string() }),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
});
const LockSchema = z.object({
  packages: z.record(z.string(), z.object({ version: z.string().optional() })),
});
const SnapshotSchema = z.object({
  head: z.string().regex(/^[0-9a-f]{40}$/u),
  tree: z.string().regex(/^[0-9a-f]{40}$/u),
  base: z.string().regex(/^[0-9a-f]{40}$/u),
  node: z.string(),
  lockSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  testMaxWorkers: z.string(),
  scope: z.enum(['release-unit-build', 'fast-quality']),
});

/** 生成物以外の変更が残る状態を、最終commitの検証結果として扱わない。 */
function requireCleanCheckout(): void {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    encoding: 'utf8',
  });
  if (status.trim())
    throw new Error('検証対象をローカルcommitし、作業ツリーをcleanにしてください。');
}

const [phase, snapshotPath, ...args] = process.argv.slice(2);
const baseInput = args[0];
if (
  (phase !== 'prepare' && phase !== 'finish') ||
  !snapshotPath ||
  !baseInput ||
  !/^[0-9a-f]{40}$/u.test(baseInput) ||
  args.length > 2 ||
  (args[1] !== undefined && args[1] !== '--release')
) {
  throw new Error('Usage: npm run check:prepush -- <CIと同じbase SHA> [--release]');
}
const base = execFileSync('git', ['rev-parse', '--verify', `${baseInput}^{commit}`], {
  encoding: 'utf8',
}).trim();
execFileSync('git', ['merge-base', '--is-ancestor', base, 'HEAD']);
requireCleanCheckout();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
if (phase === 'finish') {
  const snapshot = SnapshotSchema.parse(JSON.parse(readFileSync(snapshotPath, 'utf8')));
  if (snapshot.head !== head || snapshot.tree !== tree || snapshot.base !== base) {
    throw new Error('検証中にHEAD・tree・baseが変わりました。');
  }
  console.log(
    JSON.stringify({
      status: 'pre-push-check-passed',
      ...snapshot,
      browserPerformancePublicationVerified: false,
    }),
  );
  process.exit(0);
}
const manifest = PackageSchema.parse(JSON.parse(readFileSync('package.json', 'utf8')));
const lockBytes = readFileSync('package-lock.json');
const lock = LockSchema.parse(JSON.parse(lockBytes.toString('utf8')));
if (process.versions.node !== manifest.engines.node) {
  throw new Error(`Node版がCIと異なります: ${process.versions.node} / ${manifest.engines.node}`);
}
for (const [name, declared] of Object.entries({
  ...manifest.dependencies,
  ...manifest.devDependencies,
})) {
  const installed = z
    .object({ version: z.string() })
    .parse(JSON.parse(readFileSync(path.join('node_modules', name, 'package.json'), 'utf8')));
  if (
    installed.version !== declared ||
    declared !== lock.packages[`node_modules/${name}`]?.version
  ) {
    throw new Error(`固定依存と実体が一致しません: ${name}`);
  }
}
writeFileSync(
  snapshotPath,
  JSON.stringify({
    head,
    tree,
    base,
    node: process.versions.node,
    lockSha256: createHash('sha256').update(lockBytes).digest('hex'),
    testMaxWorkers: process.env['TSUMUCODE_TEST_MAX_WORKERS'] ?? 'CIと同じ既定値',
    scope: args[1] === '--release' ? 'release-unit-build' : 'fast-quality',
  }),
);
