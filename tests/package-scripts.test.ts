// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly scripts: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
}

const projectRoot = new URL('../', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('package.json', projectRoot), 'utf8'),
) as PackageManifest;

/** package scriptが参照する未存在のlocal tsx entrypointを重複なく返す。 */
function collectMissingTsxEntrypoints(scripts: Readonly<Record<string, string>>): string[] {
  const entrypoints = Object.values(scripts).flatMap((command) =>
    [...command.matchAll(/\btsx\s+([^\s]+)/g)].map((match) => match[1] ?? ''),
  );

  return [...new Set(entrypoints)]
    .filter((entrypoint) => entrypoint.length > 0 && !existsSync(new URL(entrypoint, projectRoot)))
    .sort();
}

/** package script内のnpm runが参照する未定義aliasを重複なく返す。 */
function collectMissingScriptAliases(scripts: Readonly<Record<string, string>>): string[] {
  const aliases = Object.values(scripts).flatMap((command) =>
    [...command.matchAll(/\bnpm\s+run\s+([\w:-]+)/g)].map((match) => match[1] ?? ''),
  );

  return [...new Set(aliases)]
    .filter((alias) => alias.length > 0 && scripts[alias] === undefined)
    .sort();
}

describe('package scripts', () => {
  it('Editor入力支援の直接Dependencyを完全固定する', () => {
    expect(manifest.dependencies).toMatchObject({
      '@codemirror/commands': '6.10.4',
      '@codemirror/language': '6.12.4',
      '@codemirror/autocomplete': '6.20.3',
      '@lezer/highlight': '1.2.3',
    });
  });

  it('教材の検証とCompileを独立したlocal entrypointとして公開する', () => {
    expect(manifest.scripts['content:compile']).toBe('tsx scripts/content/compile.ts');
    expect(manifest.scripts['content:check']).toBe('tsx scripts/content/compile.ts --check');
    expect(manifest.scripts.build).toContain('npm run content:compile');
    expect(manifest.scripts.check).toContain('npm run content:check');
  });

  it('GitHub Pages subpath smokeを実在するlocal entrypointとして公開する', () => {
    expect(manifest.scripts['smoke:subpath']).toBe('tsx scripts/smoke-subpath.ts');
  });

  it('生成済みdistを実ブラウザ品質Gateへ配信するpreview scriptを公開する', () => {
    expect(manifest.scripts.preview).toBe('vite preview');
  });

  it('Production CSSをHTMLへinline化して追加requestを避ける', () => {
    expect(manifest.scripts['build:inline-css']).toBe('tsx scripts/inline-production-css.ts');
    expect(manifest.scripts.build).toContain('vite build && npm run build:inline-css');
  });

  it('Build後の学習chunk分離検査をcheckへ組み込む', () => {
    expect(manifest.scripts['smoke:learning-chunks']).toBe('tsx scripts/check-learning-chunks.ts');
    expect(manifest.scripts.check).toContain('npm run build && npm run smoke:learning-chunks');
  });

  it('PerformanceとLighthouseの公開前Gateを固定設定で公開する', () => {
    expect(manifest.scripts['test:performance']).toBe(
      'playwright test --config=playwright.performance.config.ts && vitest run --config vitest.bundle.config.ts',
    );
    expect(manifest.scripts['test:lighthouse']).toBe('lhci autorun --config=lighthouserc.cjs');
  });

  it('Pages公開前の静的Artifact・継続性・承認・対象・Report Gateを公開する', () => {
    expect(manifest.scripts['release:check']).toBe(
      'tsx scripts/release/checkStaticArtifact.ts dist',
    );
    expect(manifest.scripts['release:continuity']).toBe(
      'tsx scripts/release/checkReleaseContinuity.ts',
    );
    expect(manifest.scripts['release:approval']).toBe(
      'tsx scripts/release/verifyReleaseApproval.ts',
    );
    expect(manifest.scripts['release:target']).toBe('tsx scripts/release/verifyReleaseTarget.ts');
    expect(manifest.scripts['release:report']).toBe('tsx scripts/release/writeReleaseReport.ts');
  });

  it('実在するlocal tsx entrypointだけを参照する', () => {
    expect(collectMissingTsxEntrypoints(manifest.scripts)).toEqual([]);
  });

  it('実在するnpm script aliasだけを参照する', () => {
    expect(collectMissingScriptAliases(manifest.scripts)).toEqual([]);
  });
});
