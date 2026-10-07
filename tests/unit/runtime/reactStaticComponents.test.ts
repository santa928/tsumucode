// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyzeStaticComponents } from '../../../src/adapters/runtime/react/checkStaticComponentsSource';
import {
  isReactCompileInput,
  isReactCompileResult,
} from '../../../src/adapters/runtime/react/compilerContract';
import {
  isStaticComponentsWorkspace,
  STATIC_COMPONENTS_MAIN,
  STATIC_COMPONENTS_TYPES,
  STATIC_COMPONENTS_HTML,
} from '../../../src/adapters/runtime/react/staticComponentsScaffold';

function checkReactSource(files: Readonly<Record<string, string>>) {
  return analyzeStaticComponents(files['components.tsx'] ?? '').diagnostics;
}

const source = `
import type { CardProps, PanelProps } from './types';
function Topic({ title, summary }: CardProps) {
  return <section><h2>{title}</h2><p>{summary}</p></section>;
}
function Frame({ children }: PanelProps) {
  return <section><h1>学習テーマ</h1>{children}</section>;
}
function Overview() {
  return <Frame><div><Topic title="HTML" summary="内容を組み立てる" /><Topic title="CSS" summary="見た目を整える" /></div></Frame>;
}
export { Overview as App };
`;
const files = { 'components.tsx': source };

describe('純粋な表示ComponentとCompositionの閉じた境界', () => {
  it('表示まで到達したPropsとchildrenだけを学習factにする', () => {
    expect(analyzeStaticComponents(source).facts).toEqual({
      reusesCardWithDistinctProps: true,
      rendersReceivedChildren: true,
      rendersAssignedPairs: true,
    });
    const ignored = source.replace(
      '{children}',
      '<div><section><h2>HTML</h2><p>内容を組み立てる</p></section><section><h2>CSS</h2><p>見た目を整える</p></section></div>',
    );
    expect(analyzeStaticComponents(ignored).diagnostics).toEqual([]);
    expect(analyzeStaticComponents(ignored).facts).toEqual({
      reusesCardWithDistinctProps: false,
      rendersReceivedChildren: false,
      rendersAssignedPairs: false,
    });
    const swapped = source
      .replace('summary="内容を組み立てる"', 'summary="見た目を整える"')
      .replace('title="CSS" summary="見た目を整える"', 'title="CSS" summary="内容を組み立てる"');
    expect(analyzeStaticComponents(swapped).facts.rendersAssignedPairs).toBe(false);
  });
  it('titleは見出し、summaryは説明として表示し、入れ替えを合格にしない', () => {
    const switched = source.replace(
      '<h2>{title}</h2><p>{summary}</p>',
      '<h2>{summary}</h2><p>{title}</p>',
    );
    expect(analyzeStaticComponents(switched).diagnostics).toEqual([]);
    expect(analyzeStaticComponents(switched).facts.rendersAssignedPairs).toBe(false);
  });
  it('Propsを別Componentへ明示的に渡す分割でも表示経路を追う', () => {
    const forwarded = source
      .replace('function Topic(', 'function Details(')
      .replace(
        'function Frame(',
        'function Topic(props: CardProps) { return <Details title={props.title} summary={props.summary} />; }\nfunction Frame(',
      );
    expect(analyzeStaticComponents(forwarded).diagnostics).toEqual([]);
    expect(analyzeStaticComponents(forwarded).facts.reusesCardWithDistinctProps).toBe(true);
  });
  it('Componentの循環と過大な展開をReactへ渡さない', () => {
    const cycle = source.replace(
      '<section><h2>{title}</h2><p>{summary}</p></section>',
      '<Topic title={title} summary={summary} />',
    );
    expect(
      analyzeStaticComponents(cycle).diagnostics.some((diagnostic) =>
        diagnostic.message.includes('再帰'),
      ),
    ).toBe(true);
    const large =
      'export function App() { return <div>' + '<span>表示</span>'.repeat(300) + '</div>; }';
    expect(analyzeStaticComponents(large).diagnostics.length).toBeGreaterThan(0);
  });
  it('未知profileと不完全なfact、固定型やHTMLの改変を拒否する', () => {
    const input = {
      sessionId: 'static-test',
      revision: 1,
      files,
      profile: 'static-components-v1' as const,
    };
    expect(isReactCompileInput(input)).toBe(true);
    expect(isReactCompileInput({ ...input, profile: 'unknown' })).toBe(false);
    const result = {
      status: 'ready',
      files: { 'components.js': '' },
      sourceMaps: { 'components.js': '' },
      facts: analyzeStaticComponents(source).facts,
    };
    expect(isReactCompileResult(result, input)).toBe(true);
    expect(isReactCompileResult({ ...result, facts: {} }, input)).toBe(false);
    expect(
      isReactCompileResult({ ...result, facts: { ...result.facts, extra: true } }, input),
    ).toBe(false);
    const workspace = {
      ...files,
      'main.tsx': STATIC_COMPONENTS_MAIN,
      'types.ts': STATIC_COMPONENTS_TYPES,
      'index.html': STATIC_COMPONENTS_HTML,
    };
    expect(isStaticComponentsWorkspace(workspace)).toBe(true);
    expect(
      isStaticComponentsWorkspace({
        ...workspace,
        'types.ts': STATIC_COMPONENTS_TYPES.replace('title: string', 'title: any'),
      }),
    ).toBe(false);
    expect(
      isStaticComponentsWorkspace({
        ...workspace,
        'index.html': STATIC_COMPONENTS_HTML.replace(
          '<div id="root">',
          '<h1>固定表示</h1><div id="root">',
        ),
      }),
    ).toBe(false);
  });
  it('任意のComponent名、異なるProps、children、Appへのexport aliasを受理する', () => {
    expect(checkReactSource(files)).toEqual([]);
    expect(checkReactSource({ 'components.tsx': source.replaceAll('Topic', 'Summary') })).toEqual(
      [],
    );
  });
  it('Propsの誤型と不足は実Compilerの型診断へ残す', () => {
    for (const changed of [
      source.replace('title="HTML"', 'title={42}'),
      source.replace(' summary="内容を組み立てる"', ''),
    ])
      expect(checkReactSource({ 'components.tsx': changed })).toEqual([]);
  });
  it.each([
    source.replace('{summary}', '{window.location.href}'),
    source.replace('{summary}', '{JSON.parse("{}")}'),
    source.replace('{summary}', '{({ type: "iframe", props: {}, key: null })}'),
    source.replace('return <section>', 'title = "変更"; return <section>'),
    source + '\nObject.assign(Topic, {});',
    source.replace('function Topic', 'async function Topic'),
    source.replace('<p>{summary}</p>', '<p dangerouslySetInnerHTML={{ __html: summary }} />'),
    source.replace('<p>{summary}</p>', '<a href={summary}>{summary}</a>'),
    source.replace('<p>{summary}</p>', '<p ref={summary}>{summary}</p>'),
    source.replace('title="HTML"', 'onClick={title} title="HTML"'),
    source.replace('title="HTML"', '{...{ title: "HTML" }}'),
    source.replace('CardProps)', 'any)'),
    source.replace('{summary}', '{summary as string}'),
    source.replace('return <Frame>', 'return <iframe>'),
    '// @ts-ignore\n' + source,
    'import { jsx } from "react/jsx-runtime";\n' + source,
  ])('副作用や能力の追加を拒否する %#', (changed) => {
    expect(checkReactSource({ 'components.tsx': changed }).length).toBeGreaterThan(0);
  });
});
