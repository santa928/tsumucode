import { describe, expect, it } from 'vitest';
import {
  isReactCompileInput,
  isReactCompileResult,
} from '../../../src/adapters/runtime/react/compilerContract';
import { analyzeInteractiveState } from '../../../src/adapters/runtime/react/checkInteractiveStateSource';

const counter = `import { useState } from 'react';
export function App() {
  const [count, setCount] = useState(0);
  function increment() { setCount(current => current + 1); }
  function twice() {
    setCount(current => current + 1);
    setCount(current => current + 1);
  }
  return <section><h1>カウンター</h1><p id="count">{count}</p>
    <button id="increment" onClick={increment}>1増やす</button>
    <button id="twice" onClick={twice}>2増やす</button></section>;
}`;
const list = `import { useState } from 'react';
import type { Topic } from './types';
export function App() {
  const [topics, setTopics] = useState<readonly Topic[]>([
    { id: 'html', label: 'HTML' }, { id: 'css', label: 'CSS' }
  ]);
  return <section><h1>学習テーマ</h1>
    <button id="add" onClick={() => setTopics(current => [...current, { id: 'js', label: 'JS' }])}>追加</button>
    <button id="remove" onClick={() => setTopics(current => current.filter(item => item.id !== 'html'))}>HTMLを削除</button>
    <button id="reverse" onClick={() => setTopics(current => current.toReversed())}>逆順</button>
    <ul id="topics">{topics.map(item => <li key={item.id}>{item.label}</li>)}</ul>
  </section>;
}`;

describe('Event/Stateの有限Source契約', () => {
  it.each([counter, list])('同期Stateの正例を受理する', (source) => {
    const result = analyzeInteractiveState(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.usesState).toBe(true);
    expect(result.facts.updatesStateFromEvent).toBe(true);
  });
  it('readonly配列の別名・更新関数と安定したKeyを確認する', () => {
    const result = analyzeInteractiveState(list);
    expect(result.facts.usesImmutableUpdates).toBe(true);
    expect(result.facts.usesStableItemKeys).toBe(true);
  });
  it('同じ配列を返す更新はimmutable更新factにならない', () => {
    expect(
      analyzeInteractiveState(list.replace('current.toReversed()', 'current')).facts
        .usesImmutableUpdates,
    ).toBe(false);
  });
  it('index keyは実表示が合っても学習条件を満たさない', () => {
    const result = analyzeInteractiveState(
      list.replace('map(item =>', 'map((item, index) =>').replace('key={item.id}', 'key={index}'),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.usesStableItemKeys).toBe(false);
  });
  it('固定表示・未使用Stateを学習条件へ数えない', () => {
    expect(analyzeInteractiveState(counter.replace('{count}', '{0}')).facts.usesState).toBe(false);
    expect(
      analyzeInteractiveState(
        counter
          .replace('onClick={increment}', 'onClick={() => 1}')
          .replace('onClick={twice}', 'onClick={() => 2}'),
      ).facts.updatesStateFromEvent,
    ).toBe(false);
  });
  it.each([
    counter.replace("import { useState } from 'react';", "import 'react';"),
    counter.replace('useState(0)', 'useState<any>(0)'),
    counter.replace('current + 1', 'document.getElementById("count")'),
    counter.replace('current + 1', 'fetch("https://example.org")'),
    counter.replace('current + 1', 'setTimeout(() => 1, 0)'),
    counter.replace('function increment()', 'async function increment()'),
    counter.replace('current + 1', '(current as number) + 1'),
    counter.replace('current + 1', 'increment()'),
    counter.replace('current + 1', 'setCount(1)'),
    list.replace('current.toReversed()', 'current.reverse()'),
    list.replace('current.toReversed()', 'current.push({id: "x", label: "X"})'),
    list.replace('item.label', 'item.constructor'),
    counter.replace('export function App()', 'export function App(event: unknown)'),
    counter + '\n// @ts-ignore\n',
  ])('能力の拡張・直接mutationを拒否する', (source) => {
    expect(analyzeInteractiveState(source).diagnostics.length).toBeGreaterThan(0);
  });
});

it('State factの欠如・型違い・余分なfactと旧profileへの混入を拒否する', () => {
  const input = {
    sessionId: 'state-test',
    revision: 1,
    profile: 'interactive-state-v1' as const,
    files: { 'components.tsx': counter },
  };
  const result = {
    status: 'ready',
    files: { 'components.js': '' },
    sourceMaps: { 'components.js': '' },
    facts: analyzeInteractiveState(counter).facts,
  };
  expect(isReactCompileInput(input)).toBe(true);
  expect(isReactCompileResult(result, input)).toBe(true);
  expect(isReactCompileResult({ ...result, facts: undefined }, input)).toBe(false);
  expect(
    isReactCompileResult({ ...result, facts: { ...result.facts, usesState: 'true' } }, input),
  ).toBe(false);
  expect(isReactCompileResult({ ...result, facts: { ...result.facts, extra: true } }, input)).toBe(
    false,
  );
  expect(isReactCompileResult(result, { ...input, profile: 'props-card-v1' })).toBe(false);
});

it('2増やすの同じhandlerへ前の値+1の純粋updaterを2回つなぐ', () => {
  expect(analyzeInteractiveState(counter).facts.queuesTwoIncrements).toBe(true);
  const single = counter.replace(
    'setCount(current => current + 1);\n    setCount(current => current + 1);',
    'setCount(count + 2);',
  );
  expect(analyzeInteractiveState(single).facts.queuesTwoIncrements).toBe(false);
  expect(
    analyzeInteractiveState(counter.replaceAll('current + 1', 'count + 1')).facts
      .queuesTwoIncrements,
  ).toBe(false);
  expect(
    analyzeInteractiveState(counter.replaceAll('current + 1', 'current * 0 + 4')).facts
      .queuesTwoIncrements,
  ).toBe(false);
  expect(
    analyzeInteractiveState(counter.replaceAll('current + 1', '(1 + current)')).facts
      .queuesTwoIncrements,
  ).toBe(true);
});
