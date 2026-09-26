// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly scripts: Readonly<Record<string, string>>;
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
  it('実在するlocal tsx entrypointだけを参照する', () => {
    expect(collectMissingTsxEntrypoints(manifest.scripts)).toEqual([]);
  });

  it('実在するnpm script aliasだけを参照する', () => {
    expect(collectMissingScriptAliases(manifest.scripts)).toEqual([]);
  });
});
