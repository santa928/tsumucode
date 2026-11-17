import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { act, isValidElement } from 'react';
import { createRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { compileReactTypeScript } from '../../src/adapters/runtime/typescript/compileTypeScript';

const require = createRequire(import.meta.url);
const libraryDirectory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(libraryDirectory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(libraryDirectory, name), 'utf8')]),
);
const reactLibraries = Object.fromEntries(
  (
    [
      ['react/index.d.ts', '@types/react', 'index.d.ts'],
      ['react/global.d.ts', '@types/react', 'global.d.ts'],
      ['react/jsx-runtime.d.ts', '@types/react', 'jsx-runtime.d.ts'],
      ['react-dom/index.d.ts', '@types/react-dom', 'index.d.ts'],
      ['react-dom/client.d.ts', '@types/react-dom', 'client.d.ts'],
      ['csstype/index.d.ts', 'csstype', 'index.d.ts'],
    ] as const
  ).map(([name, packageName, file]) => [
    name,
    readFileSync(path.join(path.dirname(require.resolve(`${packageName}/package.json`)), file), 'utf8'),
  ]),
);
const lessonId = 'react-ch01-l01';
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const lessonRoot = `content/react/chapters/react-ch01/lessons/${lessonId}`;
const card = readFileSync(
  `${lessonRoot}/exercises/${lessonId}-e01/starter/QuestionCard.tsx`,
  'utf8',
);
const support =
  "import type { Question } from './QuestionCard.js';\n" +
  "const question: Question = { prompt: 'HTMLが受け持つものは？', choices: ['内容', '見た目'], correctIndex: 0 };\n";
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Only repository-owned examples run here, not learner code or a Browser/Worker substitute. */
function executeExample(files: Readonly<Record<string, string>>): Record<string, unknown> {
  const cache = new Map<string, Record<string, unknown>>();
  function load(name: string): unknown {
    if (name === 'react/jsx-runtime') return jsxRuntime;
    const filename = name.startsWith('./') ? name.slice(2) : name;
    const source = files[filename];
    if (source === undefined) throw new Error(`Unexpected example module: ${name}`);
    const previous = cache.get(filename);
    if (previous) return previous;
    const exports: Record<string, unknown> = {};
    cache.set(filename, exports);
    // Only change module syntax after the existing strict compiler has accepted the TSX.
    const commonjs = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
      reportDiagnostics: true,
    });
    expect(commonjs.diagnostics ?? []).toEqual([]);
    runInNewContext(commonjs.outputText, { exports, require: load }, { timeout: 1_000 });
    return exports;
  }
  load('main.js');
  return cache.get('main.js')!;
}

it.each([
  ['s01', 's01-component.md'],
  ['s02', 's02-jsx.md'],
  ['s03', 's03-props.md'],
] as const)('React初回 %s の掲載TSXを明示した足場で型検査し実Reactで描画する', async (id, file) => {
  const markdown = readFileSync(`${lessonRoot}/slides/${file}`, 'utf8');
  expect(markdown).toMatch(new RegExp(`^---\nid: ${lessonId}-${id}\n`, 'u'));
  const fences = [...markdown.matchAll(/^```tsx\n([\s\S]*?)^```$/gmu)];
  expect(fences).toHaveLength(1);
  expect([...markdown.matchAll(/^```[^\n]+$/gmu)]).toHaveLength(1);
  const snippet = fences[0]![1]!;
  const source =
    support +
    (id === 's01'
      ? `${snippet}\nexport const example = <QuestionCard question={question} />;\n`
      : `${id === 's03' ? "import { QuestionCard } from './QuestionCard.js';\n" : ''}export const example = (\n${snippet});\n`);
  const input = { 'main.tsx': source, 'QuestionCard.tsx': card };
  const compiled = compileReactTypeScript(input, libraries, reactLibraries);
  expect(compiled.status, JSON.stringify(compiled)).toBe('ready');
  if (compiled.status !== 'ready') throw new Error('Published example did not typecheck');
  const example = executeExample(compiled.files)['example'];
  if (!isValidElement(example)) throw new Error('Published example did not return a React element');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(example);
    });
    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.textContent).toBe('HTMLが受け持つものは？');
    if (id === 's03') {
      expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
        '内容',
        '見た目',
      ]);
      expect(container.querySelector('section p')?.textContent).toBe('選択肢は2個です');
    }
    console.log(
      JSON.stringify({
        kind: 'react-content-example-with-support-v1',
        sourceCommit,
        lessonId,
        slideId: `${lessonId}-${id}`,
        markdownSha256: sha256(markdown),
        snippet,
        snippetSha256: sha256(snippet),
        supportSource: source,
        componentSha256: sha256(card),
        inputSha256: sha256(JSON.stringify(input)),
        strictCompile: 'ready',
        renderedHtml: container.innerHTML,
        headingText: headings[0]!.textContent,
        method: 'React DOM in JSDOM; not Browser, Worker, exercise fixtures or learner UI',
      }),
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
});
