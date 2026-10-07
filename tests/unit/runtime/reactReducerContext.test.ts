import { describe, expect, it } from 'vitest';
import { analyzeReducer } from '../../../src/adapters/runtime/react/checkReducerSource';
import {
  isReactCompileInput,
  isReactCompileResult,
} from '../../../src/adapters/runtime/react/compilerContract';
import { analyzeContext } from '../../../src/adapters/runtime/react/checkContextSource';

const reducer = `import type { FormState, FormAction } from './types';
export function reduceForm(state: FormState, action: FormAction): FormState {
  if (action.type === 'nameChanged') return { name: action.nextName, attempted: false };
  if (action.type === 'submitted') return { ...state, attempted: true };
  return { name: '', attempted: false };
}`;
const context = `import { useContext } from 'react';
import { NameContext } from './nameContext';
import type { InputChangeEvent } from './types';
export function NameField() {
  const provided = useContext(NameContext);
  if (provided === null) return <p>Providerが必要です</p>;
  const change = (event: InputChangeEvent) => { provided.onNameChange(event.currentTarget.value); };
  return <div><label htmlFor="name">名前</label><input id="name" value={provided.value} onChange={change} /></div>;
}
export function NameSummary() {
  const provided = useContext(NameContext);
  if (provided === null) return <p>Providerが必要です</p>;
  return <section><p id="name-summary">{provided.value}</p><p id="length">{provided.value.length}</p></section>;
}`;

describe('Reducerの純粋性と3actionの値の由来', () => {
  it.each([
    reducer,
    reducer
      .replace('FormState, FormAction', 'FormState as State, FormAction as Action')
      .replaceAll(': FormState', ': State')
      .replaceAll(': FormAction', ': Action')
      .replaceAll('state', 'previous')
      .replaceAll('action', 'operation'),
    `import type { FormState, FormAction } from './types';
export function reduceForm(state: FormState, action: FormAction): FormState {
 switch(action.type) {
 case 'nameChanged': return { name: action.nextName, attempted: false };
 case 'submitted': return { name: state.name, attempted: true };
 case 'reset': return { name: '', attempted: false };
 }
}`,
  ])('純粋なif/switchと型・変数aliasを許容する', (source) => {
    const result = analyzeReducer(source);
    expect(result.diagnostics).toEqual([]);
    expect(Object.values(result.facts)).toEqual([true, true, true, true, true]);
  });
  it('switch分岐のlocal値を後続returnへ保つ', () => {
    const source = `import type {FormState, FormAction} from './types';
export function reduceForm(state:FormState,action:FormAction):FormState { switch(action.type) {
case 'nameChanged': { const next = {name:action.nextName,attempted:false}; return next; }
case 'submitted': return {...state,attempted:true};
case 'reset': return {name:'',attempted:false};
}}`;
    const result = analyzeReducer(source);
    expect(result.diagnostics).toEqual([]);
    expect(Object.values(result.facts).every(Boolean)).toBe(true);
  });
  it.each([
    reducer.replace('action.nextName', "'Ada'"),
    reducer.replace('action.nextName', "'$action.nextName'"),
    reducer.replace('...state, attempted: true', "name: 'Ada', attempted: true"),
    reducer.replace('...state, attempted: true', "name: '$state.name', attempted: true"),
    reducer.replace("name: '', attempted: false", 'name: state.name, attempted: false'),
    reducer.replace("return { name: '', attempted: false }", 'return state'),
    reducer.replace('action.nextName, attempted: false', 'action.nextName, attempted: true'),
  ])('有限入力に合う固定回答と古いStateを学習factに数えない', (source) => {
    const result = analyzeReducer(source);
    expect(result.diagnostics).toEqual([]);
    expect(Object.values(result.facts).every(Boolean)).toBe(false);
  });
  it.each([
    'state.name = action.nextName;',
    'console.log(state);',
    "fetch('/');",
    'while(true) {}',
    'const extra = () => state;',
    'return state as FormState;',
    'const extra: any = state;',
    '// @ts-ignore\nconst extra = state;',
  ])('mutation・副作用・不要な能力と型抑制を拒否する', (hidden) => {
    expect(
      analyzeReducer(reducer.replace("  return { name: '',", `${hidden}\n  return { name: '',`))
        .diagnostics.length,
    ).toBeGreaterThan(0);
  });
});

describe('Contextの元ASTと2consumerの実接続', () => {
  it.each([
    context,
    context
      .replaceAll('useContext', 'readContext')
      .replace('import { readContext }', 'import { useContext as readContext }')
      .replaceAll('NameContext', 'SharedName')
      .replace('import { SharedName }', 'import { NameContext as SharedName }'),
    context.replace('{provided.value}</p>', '{provided.value.trim()}</p>'),
  ])('同Contextと同期callback、trim表示の別解を許容する', (source) => {
    const result = analyzeContext(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts).toEqual({
      readsSameProvidedValue: true,
      forwardsProvidedUpdate: true,
      derivesFromProvidedValue: true,
    });
  });
  it.each([
    context.replace('value={provided.value}', 'value="Ada"'),
    context.replace('{provided.value}</p>', '最初の名前</p>'),
    context.replace('{provided.value.length}', '{3}'),
    context.replace('<input id="name" value={provided.value} onChange={change} />', ''),
  ])('Contextを読むだけの空consumerと固定表示は合格にしない', (source) => {
    const result = analyzeContext(source);
    expect(result.diagnostics).toEqual([]);
    expect(Object.values(result.facts).every(Boolean)).toBe(false);
  });
  it.each([
    context.replace('return <p>Providerが必要です</p>', "return <p>{console.log('guard')}</p>"),
    context.replace(
      'return <p>Providerが必要です</p>',
      "{ console.log('guard'); return <p>案内</p>; }",
    ),
    context.replace('provided === null', "console.log('guard') === null"),
    context.replace('useContext(NameContext)', 'useContext(NameContext, 1)'),
    context.replace('useContext(NameContext)', 'useContext<any>(NameContext)'),
    context.replace('useContext(NameContext)', 'useContext(OtherContext)'),
    context.replace('  const change', '  const NameContext = provided;\n  const change'),
    context.replace('  const change', '  const useContext = provided;\n  const change'),
    context.replace('  const change', '  const provided = 1;\n  const change'),
    context.replace('import { useContext }', 'import { useContext, useState }'),
    context.replace('import { NameContext }', 'import { NameContext as useContext }'),
    context.replace('import type { InputChangeEvent }', 'import type { InputChangeEvent as App }'),
    context.replace('  const change', '  const extra = useContext(NameContext);\n  const change'),
    context.replace('provided.value}', '(provided.value as string)}'),
    context.replace(
      '  const change',
      "  const hidden = (event: InputChangeEvent) => { fetch('/'); };\n  const change",
    ),
    context.replace('const change = (', 'const change = async ('),
    context + '\nconst ignored = fetch("/");',
  ])('削除対象にも能力・shadowing・型抑制・別Contextを隠せない', (source) => {
    expect(analyzeContext(source).diagnostics.length).toBeGreaterThan(0);
  });
});

it('新profileのfactsの余分・不足・非booleanを拒否する', () => {
  for (const profile of ['reducer-form-v1', 'context-sharing-v1'] as const) {
    const files: Record<string, string> =
      profile === 'reducer-form-v1' ? { 'reducer.ts': reducer } : { 'components.tsx': context };
    const input = { sessionId: 'contract', revision: 1, profile, files };
    expect(isReactCompileInput(input)).toBe(true);
    const facts =
      profile === 'reducer-form-v1' ? analyzeReducer(reducer).facts : analyzeContext(context).facts;
    const compiled = {
      status: 'ready',
      files: Object.fromEntries(
        Object.keys(files).map((file) => [file.replace(/\.tsx?$/, '.js'), 'export {};']),
      ),
      sourceMaps: Object.fromEntries(
        Object.keys(files).map((file) => [file.replace(/\.tsx?$/, '.js'), '{}']),
      ),
      facts,
    };
    expect(isReactCompileResult(compiled, input)).toBe(true);
    expect(isReactCompileResult({ ...compiled, facts: { ...facts, extra: true } }, input)).toBe(
      false,
    );
    const [key] = Object.keys(facts);
    expect(isReactCompileResult({ ...compiled, facts: { ...facts, [key!]: 1 } }, input)).toBe(
      false,
    );
    const missing = Object.fromEntries(Object.entries(facts).filter(([field]) => field !== key));
    expect(isReactCompileResult({ ...compiled, facts: missing }, input)).toBe(false);
  }
});
