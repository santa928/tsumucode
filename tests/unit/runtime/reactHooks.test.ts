import { describe, expect, it } from 'vitest';
import { analyzeRef } from '../../../src/adapters/runtime/react/checkRefSource';
import { analyzeExternalSource } from '../../../src/adapters/runtime/react/checkExternalSource';
import {
  isReactCompileInput,
  isReactCompileResult,
} from '../../../src/adapters/runtime/react/compilerContract';
import {
  isHookWorkspace,
  REF_MAIN,
  REF_TYPES,
  EFFECT_MAIN,
  SOURCE_MODULE,
  SOURCE_TYPES,
  SOURCE_HTML,
  CUSTOM_HOOK_MAIN,
  CUSTOM_HOOK_COMPONENTS,
} from '../../../src/adapters/runtime/react/hookScaffold';
import { CONTROLLED_FORM_HTML } from '../../../src/adapters/runtime/react/controlledFormScaffold';
import { ReactLearningRuleDefinitionSchema } from '../../../src/core/content/schema';

const ref = `import { useRef, useState } from 'react';
import type { InputChangeEvent } from './types';
export function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  function change(event: InputChangeEvent) {
    setName(event.currentTarget.value);
  }
  function focusInput() {
    inputRef.current?.focus();
  }
  return <section>
    <label htmlFor="name">名前</label>
    <input id="name" ref={inputRef} value={name} onChange={change} />
    <button id="focus" type="button" onClick={focusInput}>入力へ移る</button>
    <p id="name-summary">{name}</p>
    <p id="length">{name.length}</p>
  </section>;
}`;
const setup = `const [value, setValue] = useState('');
  useEffect(() => {
    const stop = subscribe(target, setValue);
    return stop;
  }, [target]);`;
const effect = `import { useState, useEffect } from 'react';
import { subscribe } from './source';
import type { SourcePanelProps } from './types';
export function SourcePanel({ target }: SourcePanelProps) {
  ${setup}
  return <section>
    <p id="observed">{value}</p>
    <p id="length">{value.length}</p>
  </section>;
}`;
const hook = `import { useState, useEffect } from 'react';
import { subscribe } from './source';
import type { SourceId } from './types';
export function useSourceValue(target: SourceId) {
  ${setup}
  return value;
}`;

describe('Refを入力とEventへ結び、表示Stateと分ける', () => {
  it.each([
    ref,
    ref.replace(
      'inputRef.current?.focus();',
      'if (inputRef.current) { inputRef.current.focus(); }',
    ),
    ref
      .replace('useRef,', 'useRef as makeRef,')
      .replace('= useRef<', '= makeRef<')
      .replaceAll('inputRef', 'nameRef'),
  ])('同じinputへのnull安全な別解とaliasを受理する', (source) => {
    const result = analyzeRef(source);
    expect(result.diagnostics).toEqual([]);
    expect(Object.values(result.facts).every(Boolean)).toBe(true);
  });
  it.each([
    ref.replace('inputRef.current?.focus();', ''),
    ref.replace('ref={inputRef} ', ''),
    ref.replace('{name.length}', '{3}'),
    ref.replace('value={name}', 'value="Ada"'),
  ])('未接続focus・固定表示を合格にしない', (source) => {
    const result = analyzeRef(source);
    expect(result.diagnostics).toEqual([]);
    expect(Object.values(result.facts).every(Boolean)).toBe(false);
  });
  it.each([
    ref.replace('inputRef.current?.focus();', 'inputRef.current?.blur();'),
    ref.replace(
      'inputRef.current?.focus();',
      'inputRef.current?.ownerDocument.getElementById("root");',
    ),
    ref.replace(
      'inputRef.current?.focus();',
      'console.log(inputRef.current); inputRef.current?.focus();',
    ),
    ref.replace('inputRef.current?.focus();', 'inputRef.current!.focus();'),
    ref.replace('ref={inputRef}', 'ref={inputRef} onFocus={() => inputRef.current?.focus()}'),
    ref.replace('id="name" ref=', 'id="other" ref='),
    ref.replace('return <section>', 'inputRef.current?.focus(); return <section>'),
    ref.replace('function focusInput()', 'function focusInput(inputRef: any)'),
    ref.replace('入力へ移る</button>', '{console.log("削除するJSX")}入力へ移る</button>'),
  ])('正規化で削除する領域にも能力を隠せない', (source) => {
    expect(analyzeRef(source).diagnostics.length).toBeGreaterThan(0);
  });
});

describe.each([
  [false, effect],
  [true, hook],
] as const)('外部同期とcleanupの同一性 customHook=%s', (custom, source) => {
  it.each([
    source,
    source.replace(
      'const stop = subscribe(target, setValue);\n    return stop;',
      'return subscribe(target, setValue);',
    ),
    source.replace('return stop;', 'return () => stop();'),
    source.replace('return stop;', 'const cleanup = stop; return () => { cleanup(); };'),
    source
      .replace('useState, useEffect', 'useState as state, useEffect as effect')
      .replace('= useState(', '= state(')
      .replace('useEffect(()', 'effect(()'),
  ])('現在target/受取State/返すcleanupの由来を追う', (candidate) => {
    const result = analyzeExternalSource(candidate, custom);
    expect(result.diagnostics).toEqual([]);
    expect(Object.values(result.facts).every(Boolean)).toBe(true);
  });
  it.each([
    source.replace('return stop;', 'return () => {};'),
    source.replace('return stop;', 'return stop();'),
    source.replace('return stop;', ''),
    source.replace('[target]', '[]'),
    source.replace('subscribe(target,', "subscribe('source-a',"),
    custom
      ? source.replace('return value;', "return '';")
      : source.replace('{value.length}', '{3}'),
  ])('cleanup欠落・即時解除・依存欠落・固定回答を合格にしない', (candidate) => {
    const result = analyzeExternalSource(candidate, custom);
    expect(result.diagnostics).toEqual([]);
    expect(Object.values(result.facts).every(Boolean)).toBe(false);
  });
  it.each([
    source.replace('return stop;', 'return () => { stop(); stop(); };'),
    source.replace('return stop;', 'return () => { fetch("/"); };'),
    source.replace('return stop;', 'const hidden = () => fetch("/"); return stop;'),
    source.replace('const stop =', 'const extra = subscribe(target, setValue); const stop ='),
    source.replace('useEffect(()', 'useEffect(async ()'),
    source.replace('setValue);', 'next => setValue("固定"));'),
    source.replace('useEffect(()', 'console.log(value); useEffect(()'),
    source.replace('[target]', '[target, value]'),
    source.replace('return stop;', 'const subscribe = stop; return stop;'),
    source.replace('return stop;', 'return stop as any;'),
    source + '\nconst ignored = fetch("/");',
  ])('余分な能力とHook/購読のshadowingを拒否する', (candidate) => {
    expect(analyzeExternalSource(candidate, custom).diagnostics.length).toBeGreaterThan(0);
  });
});

it('固定購読の観測idをlearnerの表示へ差し替えない', () => {
  for (const id of ['active', 'notifications', 'source-a', 'root']) {
    expect(
      analyzeExternalSource(effect.replace('id="observed"', `id="${id}"`), false).diagnostics
        .length,
    ).toBeGreaterThan(0);
  }
});

it('新Hook profileもfactsの余分・不足・非booleanを拒否する', () => {
  for (const [profile, file, code, facts] of [
    ['ref-focus-v1', 'components.tsx', ref, analyzeRef(ref).facts],
    ['effect-sync-v1', 'components.tsx', effect, analyzeExternalSource(effect, false).facts],
    ['custom-source-hook-v1', 'sourceHook.ts', hook, analyzeExternalSource(hook, true).facts],
  ] as const) {
    const input = { sessionId: 'hooks-contract', revision: 1, profile, files: { [file]: code } };
    expect(isReactCompileInput(input)).toBe(true);
    const compiled = {
      status: 'ready',
      files: { [file.replace(/\.tsx?$/, '.js')]: 'export {};' },
      sourceMaps: { [file.replace(/\.tsx?$/, '.js')]: '{}' },
      facts,
    };
    expect(isReactCompileResult(compiled, input)).toBe(true);
    const [first] = Object.keys(facts);
    expect(isReactCompileResult({ ...compiled, facts: { ...facts, extra: true } }, input)).toBe(
      false,
    );
    expect(isReactCompileResult({ ...compiled, facts: { ...facts, [first!]: 1 } }, input)).toBe(
      false,
    );
    expect(
      isReactCompileResult(
        {
          ...compiled,
          facts: Object.fromEntries(Object.entries(facts).filter(([name]) => name !== first)),
        },
        input,
      ),
    ).toBe(false);
  }
});

it('保存・Importでも固定の外部DOMと購読観測を改変できない', () => {
  for (const [profile, files] of [
    [
      'ref-focus-v1',
      {
        'main.tsx': REF_MAIN,
        'types.ts': REF_TYPES,
        'components.tsx': ref,
        'index.html': CONTROLLED_FORM_HTML,
      },
    ],
    [
      'effect-sync-v1',
      {
        'main.tsx': EFFECT_MAIN,
        'types.ts': SOURCE_TYPES,
        'source.ts': SOURCE_MODULE,
        'components.tsx': effect,
        'index.html': SOURCE_HTML,
      },
    ],
    [
      'custom-source-hook-v1',
      {
        'main.tsx': CUSTOM_HOOK_MAIN,
        'types.ts': SOURCE_TYPES,
        'source.ts': SOURCE_MODULE,
        'components.tsx': CUSTOM_HOOK_COMPONENTS,
        'sourceHook.ts': hook,
        'index.html': SOURCE_HTML,
      },
    ],
  ] as const) {
    expect(isHookWorkspace(files, profile)).toBe(true);
    expect(isHookWorkspace({ ...files, 'extra.ts': 'export {};' }, profile)).toBe(false);
    expect(
      isHookWorkspace({ ...files, 'main.tsx': files['main.tsx'] + '\n// 足場改変' }, profile),
    ).toBe(false);
    expect(
      isHookWorkspace(
        { ...files, 'index.html': files['index.html'] + '<p id="active">0</p>' },
        profile,
      ),
    ).toBe(false);
  }
});

it('Custom Hookの学習RuleはsourceHook.tsを受理し、別責務のFileを拒否する', () => {
  const rule = {
    id: 'hook-learning',
    label: '外部入力の値をHookから返す',
    required: true,
    group: 'all',
    viewportMode: 'all',
    viewportIds: ['desktop-1280'],
    target: { kind: 'react-learning', file: 'sourceHook.ts' },
    assertion: { kind: 'react-learning', goal: 'source-hook' },
    hintId: 'hook-hint',
    relatedSlideId: 'hook-slide',
    feedback: {
      target: 'Hookの返す値',
      expected: '購読したStateの値',
      nextAction: '返す値と表示を見比べる',
    },
  };
  expect(ReactLearningRuleDefinitionSchema.safeParse(rule).success).toBe(true);
  for (const file of ['components.tsx', 'reducer.ts', 'other.ts']) {
    expect(
      ReactLearningRuleDefinitionSchema.safeParse({ ...rule, target: { ...rule.target, file } })
        .success,
    ).toBe(false);
  }
});
