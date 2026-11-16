// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, expect, it } from 'vitest';
import {
  compileReactTypeScript,
  createReactTypeCheckSeed,
  createSeededReactCompiler,
  type ReactTypeCheckSeed,
} from '../../../src/adapters/runtime/typescript/compileTypeScript';

const require = createRequire(import.meta.url);
const directory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(directory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(directory, name), 'utf8')]),
);
const names = [
  '@types/react/index.d.ts',
  '@types/react/global.d.ts',
  '@types/react/jsx-runtime.d.ts',
  '@types/react-dom/index.d.ts',
  '@types/react-dom/client.d.ts',
  'csstype/index.d.ts',
];
const declarations = Object.fromEntries(
  names.map((name) => [
    name.replace('@types/', ''),
    readFileSync(path.join('node_modules', name), 'utf8'),
  ]),
);
const source = `import { useState } from 'react';
import { createRoot } from 'react-dom/client';
export function Counter() {
  const [value] = useState(0);
  return <p>{value.toFixed(2)}</p>;
}
createRoot(document.createElement('div')).render(<Counter />);
`;
const files = { 'main.tsx': source };
let seed: ReactTypeCheckSeed;
beforeAll(async () => {
  seed = await createReactTypeCheckSeed(libraries, declarations);
}, 30_000);

it('型検査済み固定宣言のseedからも同じJSとsource mapを返す', async () => {
  const compiler = await createSeededReactCompiler(libraries, declarations, seed);
  const original = compileReactTypeScript(files, libraries, declarations);
  expect(original.status).toBe('ready');
  expect(compiler(files)).toEqual(original);
  expect(new TextEncoder().encode(JSON.stringify(seed)).byteLength).toBeLessThan(128 * 1024);
}, 30_000);

it('学習者の型誤りを既存compilerと同じ診断で拒否しJSを返さない', async () => {
  const wrong = { 'main.tsx': source.replace('useState(0)', "useState('0')") };
  const compiler = await createSeededReactCompiler(libraries, declarations, seed);
  const original = compileReactTypeScript(wrong, libraries, declarations);
  expect(original.status).toBe('type-error');
  expect(compiler(wrong)).toEqual(original);
  expect(compiler(wrong)).not.toHaveProperty('files');
}, 30_000);

it('global変更はcold経路で元の宣言診断を維持する', async () => {
  const changed = {
    'main.tsx': source + '\ndeclare global { interface HTMLElement { id: number; } }\n',
  };
  const compiler = await createSeededReactCompiler(libraries, declarations, seed);
  const original = compileReactTypeScript(changed, libraries, declarations);
  expect(original.status).toBe('environment-error');
  expect(compiler(changed)).toEqual(original);
}, 30_000);

it.each(['standard', 'react'] as const)(
  '固定%s宣言の変更を古い検査済み結果で通さない',
  async (kind) => {
    const standard =
      kind === 'standard'
        ? {
            ...libraries,
            'lib.es5.d.ts':
              libraries['lib.es5.d.ts']! + '\ndeclare const brokenSeed: MissingSeedType;\n',
          }
        : libraries;
    const react =
      kind === 'react'
        ? {
            ...declarations,
            'csstype/index.d.ts':
              declarations['csstype/index.d.ts']! +
              '\ndeclare const brokenSeed: MissingSeedType;\n',
          }
        : declarations;
    const compiler = await createSeededReactCompiler(standard, react, seed);
    const original = compileReactTypeScript(files, standard, react);
    expect(original.status).toBe('environment-error');
    expect(compiler(files)).toEqual(original);
  },
  30_000,
);

it('明示した追加libを拒否せずcold経路と同じ結果を返す', async () => {
  const extra = {
    'main.tsx':
      '/// <reference lib="es2024.object" />\n' +
      source +
      '\nconst groups = Object.groupBy([1, 2], (value) => value);\n',
  };
  const compiler = await createSeededReactCompiler(libraries, declarations, seed);
  const original = compileReactTypeScript(extra, libraries, declarations);
  expect(original.status).toBe('ready');
  expect(compiler(extra)).toEqual(original);
}, 30_000);

it('不正なseed metadataからは既存のfull検査へ戻る', async () => {
  const compiler = await createSeededReactCompiler(libraries, declarations, {
    ...seed,
    compilerVersion: 'invalid',
  });
  const original = compileReactTypeScript(files, libraries, declarations);
  expect(compiler(files)).toEqual(original);
}, 30_000);

it('先頭コメント中のno-default-lib指定も既存どおり検査する', async () => {
  const referenced = {
    'main.tsx': '// 学習者のファイル説明\n/// <reference no-default-lib="true" />\n' + source,
  };
  const compiler = await createSeededReactCompiler(libraries, declarations, seed);
  const original = compileReactTypeScript(referenced, libraries, declarations);
  expect(original.status).toBe('ready');
  expect(compiler(referenced)).toEqual(original);
}, 30_000);

it('seedと同名同内容の正当な入力も既存どおりJSを返す', async () => {
  const same = {
    '__seed.ts':
      "import type {} from 'react'; import type {} from 'react/jsx-runtime'; " +
      "import type {} from 'react-dom'; import type {} from 'react-dom/client'; " +
      "import type {} from 'csstype'; export {};",
  };
  const compiler = await createSeededReactCompiler(libraries, declarations, seed);
  const original = compileReactTypeScript(same, libraries, declarations);
  expect(original.status).toBe('ready');
  expect(compiler(same)).toEqual(original);
}, 30_000);

it.each(['diagnostic', 'foreign-source'] as const)(
  '読めるが不正なseed内部%sも完全検査へ戻す',
  async (kind) => {
    const info = JSON.parse(seed.buildInfo) as {
      fileNames: string[];
      fileInfos: unknown[];
      semanticDiagnosticsPerFile?: unknown[];
    };
    if (kind === 'diagnostic') {
      info.semanticDiagnosticsPerFile = [
        [1, [{ category: 1, code: 9999, messageText: '過去の無関係な診断', start: 0, length: 0 }]],
      ];
    } else {
      const index = info.fileNames.findIndex((name) => name.endsWith('/__seed.ts'));
      expect(index).toBeGreaterThanOrEqual(0);
      info.fileNames[index] = './main.tsx';
      info.fileInfos[index] = source;
    }
    const compiler = await createSeededReactCompiler(libraries, declarations, {
      ...seed,
      buildInfo: JSON.stringify(info),
    });
    const original = compileReactTypeScript(files, libraries, declarations);
    expect(original.status).toBe('ready');
    expect(compiler(files)).toEqual(original);
  },
  30_000,
);
