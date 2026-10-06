// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkTypeScript,
  compileTypeScript,
  createTypeScriptProbeChecker,
} from '../../../src/adapters/runtime/typescript/compileTypeScript';

const require = createRequire(import.meta.url);
const libraryDirectory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(libraryDirectory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(libraryDirectory, name), 'utf8')]),
);

describe('TypeScriptの型検査境界', () => {
  it('複数ファイルの型不一致を元TS位置へ返し、修正後だけJSを返す', () => {
    const files = {
      'score.ts': 'export function twice(value: number): number { return value * 2; }',
      'main.ts': 'import { twice } from "./score.js";\nconsole.log(twice("3"));',
    };
    const rejected = compileTypeScript(files, libraries);
    expect(rejected.status).toBe('type-error');
    expect(rejected).not.toHaveProperty('files');
    if (rejected.status !== 'ready') {
      expect(rejected.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 2345, file: 'main.ts', line: 2 })]),
      );
    }
    expect(files['main.ts']).toContain('twice("3")');
    const fixed = compileTypeScript(
      { ...files, 'main.ts': files['main.ts'].replace('"3"', '3') },
      libraries,
    );
    expect(fixed.status).toBe('ready');
    if (fixed.status === 'ready') {
      expect(Object.keys(fixed.files).sort()).toEqual(['main.js', 'score.js']);
      expect(fixed.files['score.js']).toContain('return value * 2');
      expect(fixed.files['score.js']).not.toContain(': number');
    }
  });

  it('DOMのnull確認、unknownの絞り込みとgenericを実compilerで検査する', () => {
    const source =
      'function first<T>(items: readonly T[]): T | undefined { return items[0]; }\nconst title = document.querySelector("h1");\nconst value: unknown = first(["学習ノート"]);\nif (title && typeof value === "string") title.textContent = value;';
    expect(compileTypeScript({ 'main.ts': source }, libraries).status).toBe('ready');
    const withoutNarrowing = source.replace('if (title && typeof value === "string") ', '');
    expect(compileTypeScript({ 'main.ts': withoutNarrowing }, libraries).status).toBe('type-error');
  });

  it('構文エラーと標準lib読込障害を型エラーから分離する', () => {
    expect(compileTypeScript({ 'main.ts': 'const value: = 1;' }, libraries).status).toBe(
      'syntax-error',
    );
    expect(compileTypeScript({ 'main.ts': 'const value = 1;' }, {}).status).toBe(
      'environment-error',
    );
    const incompleteLibraries = { ...libraries };
    delete incompleteLibraries['lib.dom.d.ts'];
    expect(
      compileTypeScript({ 'main.ts': 'document.title = "学習";' }, incompleteLibraries).status,
    ).toBe('environment-error');
  });

  it('ホストファイルやnpm型定義を探索せず、存在しない相対importも拒否する', () => {
    for (const specifier of ['node:fs', 'react', '/etc/passwd', '../../secret', './missing.js']) {
      const result = compileTypeScript(
        { 'main.ts': `import { read } from "${specifier}"; read();` },
        libraries,
      );
      expect(result.status).toBe('type-error');
      expect(result).not.toHaveProperty('files');
    }
  }, 15_000);

  it('変換成功を実行成功とみなさず、入力のコードを実行しない', () => {
    expect(
      compileTypeScript({ 'main.ts': 'throw new Error("これは実行時の失敗");' }, libraries).status,
    ).toBe('ready');
    expect(compileTypeScript({ 'main.ts': 'while (true) {}' }, libraries).status).toBe('ready');
  });

  it('Workspace外path・宣言注入・入力予算超過を検査前に拒否する', () => {
    for (const name of [
      '../main.ts',
      '/main.ts',
      'lib.es2023.full.d.ts',
      'main.tsx',
      '__proto__.d.ts',
    ]) {
      expect(compileTypeScript({ [name]: '' }, libraries).status).toBe('invalid-input');
    }
    expect(compileTypeScript({}, libraries).status).toBe('invalid-input');
    expect(compileTypeScript({ 'main.ts': ' '.repeat(131_073) }, libraries).status).toBe(
      'invalid-input',
    );
    expect(
      compileTypeScript(
        Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`f${String(i)}.ts`, ''])),
        libraries,
      ).status,
    ).toBe('invalid-input');
  });

  it('正負probeの変更・復帰を独立検査と同じ診断で返し、入力を変更しない', () => {
    const checkProbe = createTypeScriptProbeChecker();
    const files = {
      'score.ts': 'export function twice(value: number): number { return value * 2; }',
      'main.ts': 'import { twice } from "./score.js"; export const result = twice(3);',
    };
    const original = structuredClone(files);
    for (const input of [
      files,
      { ...files, 'main.ts': files['main.ts'].replace('twice(3)', 'twice("3")') },
      files,
      { ...files, 'score.ts': files['score.ts'].replace('value: number', 'value: string') },
      files,
      { 'main.ts': files['main.ts'] },
      files,
    ]) {
      expect(checkProbe(input, libraries)).toEqual(checkTypeScript(input, libraries));
    }
    expect(files).toEqual(original);
    expect(checkProbe(files, libraries)).toEqual({ status: 'valid' });
    expect(checkProbe(files, {})).toEqual(checkTypeScript(files, {}));
    expect(checkProbe(files, libraries)).toEqual({ status: 'valid' });
  }, 20_000);

  it('global型と標準libの変更・削除後に古い診断やpropertyを再利用しない', () => {
    const checkProbe = createTypeScriptProbeChecker();
    const safe = { 'main.ts': 'export const value: number = 1;' };
    expect(checkProbe(safe, libraries)).toEqual({ status: 'valid' });
    const brokenGlobal = {
      'main.ts': safe['main.ts'] + 'declare global { interface HTMLElement { id: number; } }',
    };
    const broken = checkTypeScript(brokenGlobal, libraries);
    expect(broken.status).toBe('environment-error');
    expect(checkProbe(brokenGlobal, libraries)).toEqual(broken);
    expect(checkProbe(safe, libraries)).toEqual({ status: 'valid' });

    const augmented = {
      'main.ts': 'export {}; declare global { interface HTMLElement { __probeProperty: number; } }',
    };
    expect(checkProbe(augmented, libraries)).toEqual({ status: 'valid' });
    const removed = {
      'main.ts': "export const value: number = document.createElement('span').__probeProperty;",
    };
    const absent = checkTypeScript(removed, libraries);
    expect(absent.status).toBe('type-error');
    expect(checkProbe(removed, libraries)).toEqual(absent);

    const customLibraries = { ...libraries };
    customLibraries['lib.dom.d.ts'] = libraries['lib.dom.d.ts']!.replace(
      /interface HTMLElement\b[^{]*\{/u,
      '$&\n readonly __probeProperty: number;\n',
    );
    expect(customLibraries['lib.dom.d.ts']).not.toBe(libraries['lib.dom.d.ts']);
    expect(checkProbe(removed, customLibraries)).toEqual({ status: 'valid' });
    expect(checkProbe(removed, libraries)).toEqual(absent);
    expect(createTypeScriptProbeChecker()(removed, libraries)).toEqual(absent);
  }, 20_000);
});
