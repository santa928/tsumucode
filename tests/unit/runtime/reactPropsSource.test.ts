// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkPropsSource } from '../../../src/adapters/runtime/react/checkPropsSource';
import {
  isReactCompileInput,
  isReactCompileResult,
} from '../../../src/adapters/runtime/react/compilerContract';
import { compileReactTypeScript } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import {
  isPropsWorkspace,
  PROPS_CARD_SOURCE,
} from '../../../src/adapters/runtime/react/propsCardScaffold';

const pilot = JSON.parse(
  readFileSync('scripts/content/fixtures/react-component-author-pilot.json', 'utf8'),
) as {
  component: string;
  fixtures: { id: string; source: string }[];
};
const files = {
  'main.tsx': pilot.fixtures.find((item) => item.id === 'solution')!.source,
  'QuestionCard.tsx': pilot.component,
};

describe('最初のProps課題の閉じたTSX境界', () => {
  it('整形とコメントだけの差は受理し、読み取り専用の型・表示差し替えは拒否する', () => {
    expect(checkPropsSource({ ...files, 'QuestionCard.tsx': PROPS_CARD_SOURCE })).toEqual([]);
    expect(
      checkPropsSource({ ...files, 'QuestionCard.tsx': '// コメントだけ\n' + PROPS_CARD_SOURCE }),
    ).toEqual([]);
    for (const changed of [
      PROPS_CARD_SOURCE.replace('readonly prompt: string', 'readonly prompt: number'),
      PROPS_CARD_SOURCE.replace('{question.prompt}', 'HTMLが受け持つものは？'),
      PROPS_CARD_SOURCE.replace('readonly prompt: string', 'readonly prompt: number').replace(
        '{question.prompt}',
        'HTMLが受け持つものは？',
      ),
    ])
      expect(checkPropsSource({ ...files, 'QuestionCard.tsx': changed }).length).toBeGreaterThan(0);
  });
  it('HTMLの固定表示注入と追加Fileを拒否する', () => {
    const html = readFileSync(
      'content/react/chapters/react-ch01/lessons/react-ch01-l01/exercises/react-ch01-l01-e01/starter/index.html',
      'utf8',
    );
    const workspace = { ...files, 'index.html': html };
    expect(isPropsWorkspace(workspace)).toBe(true);
    expect(
      isPropsWorkspace({
        ...workspace,
        'index.html': html.replace(
          '<div id="root">',
          '<h1 id="question-prompt">HTMLが受け持つものは？</h1><div id="root">',
        ),
      }),
    ).toBe(false);
    expect(isPropsWorkspace({ ...workspace, 'extra.css': '' })).toBe(false);
  });
  it('作者の4原稿をJSX境界では受理し、誤型は実Compilerへ残す', () => {
    for (const fixture of pilot.fixtures)
      expect(checkPropsSource({ ...files, 'main.tsx': fixture.source }), fixture.id).toEqual([]);
  });
  it.each([
    '<section dangerouslySetInnerHTML={{ __html: "<img src=x>" }}>',
    '<section {...{ dangerouslySetInnerHTML: { __html: "x" } }}>',
    '<section ref={() => {}}>',
    '<section onClick={() => {}}>',
    '<iframe src="https://example.com">',
    '<a href="https://example.com">',
  ])('trusted Reactへ危険なタグ/属性を渡す %s を拒否する', (opening) => {
    const component = files['QuestionCard.tsx'].replace(
      '<section aria-labelledby="question-prompt">',
      opening,
    );
    expect(checkPropsSource({ ...files, 'QuestionCard.tsx': component }).length).toBeGreaterThan(0);
  });
  it('JSX内部の偽ReactElementと直接JSX factory importを拒否する', () => {
    const fake = files['QuestionCard.tsx'].replace(
      '{question.prompt}',
      '{({ type: "iframe", props: {}, key: null })}',
    );
    expect(checkPropsSource({ ...files, 'QuestionCard.tsx': fake }).length).toBeGreaterThan(0);
    expect(
      checkPropsSource({
        ...files,
        'main.tsx': "import { jsx } from 'react/jsx-runtime';\n" + files['main.tsx'],
      }).length,
    ).toBeGreaterThan(0);
  });
  it('TSXとTSのemit衝突、予約module、過剰なWorker結果を受理しない', () => {
    const input = { sessionId: 'react-test', revision: 1, files };
    expect(isReactCompileInput(input)).toBe(true);
    expect(isReactCompileInput({ ...input, files: { ...files, 'main.ts': '' } })).toBe(false);
    expect(
      isReactCompileInput({ ...input, files: { ...files, 'tsumucode-react-runtime.js': '' } }),
    ).toBe(false);
    expect(
      isReactCompileResult(
        { status: 'ready', files: { 'main.js': '' }, sourceMaps: { 'main.js': '' } },
        input,
      ),
    ).toBe(false);
  });
  it('固定React型定義のどれが欠落しても環境失敗として止まり、JSを返さない', () => {
    const names = [
      'react/index.d.ts',
      'react/global.d.ts',
      'react/jsx-runtime.d.ts',
      'react-dom/index.d.ts',
      'react-dom/client.d.ts',
      'csstype/index.d.ts',
    ];
    for (const missing of names) {
      const declarations = Object.fromEntries(
        names.map((name) => [name, name === missing ? '' : '// 固定型定義']),
      );
      const result = compileReactTypeScript(files, {}, declarations);
      expect(result.status, missing).toBe('environment-error');
      expect(result).not.toHaveProperty('files');
      expect(result).not.toHaveProperty('sourceMaps');
      if (result.status !== 'ready')
        expect(result.diagnostics[0]?.message).toContain('Reactの型定義');
    }
  });
  it('anyを返すfactoryと起動後の後書きで静的Props境界を迂回できない', () => {
    const source = files['main.tsx'];
    for (const altered of [
      source.replace(
        /const question: Question = \{[\s\S]*?\n\};/u,
        "const question: Question = JSON.parse('{}');",
      ),
      source + '\nObject.assign(question, { prompt: 42 });\n',
      source + '\nObject.create(null);\n',
    ])
      expect(checkPropsSource({ ...files, 'main.tsx': altered }).length).toBeGreaterThan(0);
  });
});
