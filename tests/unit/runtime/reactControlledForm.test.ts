import {
  isReactCompileInput,
  isReactCompileResult,
} from '../../../src/adapters/runtime/react/compilerContract';
import { describe, expect, it } from 'vitest';
import { analyzeControlledForm } from '../../../src/adapters/runtime/react/checkControlledFormSource';

const form = `import { useState } from 'react';
import type { FormState, InputChangeEvent, FormSubmitEvent } from './types';
export function App() {
  const [form, setForm] = useState<FormState>({ name: '', attempted: false });
  const missing = form.name.trim().length === 0;
  const message = form.attempted ? (missing ? '名前を入力してください' : '送信を受け付けました') : '入力中';
  function change(event: InputChangeEvent) {
    const next = event.currentTarget.value;
    setForm({ name: next, attempted: false });
  }
  function submit(event: FormSubmitEvent) {
    event.preventDefault();
    setForm(current => ({ ...current, attempted: true }));
  }
  return <section><h1>名前のForm</h1><form id="name-form" onSubmit={submit}>
    <label htmlFor="name">名前</label>
    <input id="name" value={form.name} onChange={change} aria-describedby="message" aria-invalid={form.attempted && missing} />
    <p id="length">{form.name.length}</p><p id="message" role="status">{message}</p>
    <button id="submit" type="submit">送信</button>
    <button id="reset" type="button" onClick={() => setForm({ name: '', attempted: false })}>やり直し</button>
  </form></section>;
}`;
const shared = `import { useState } from 'react';
import type { NameFieldProps, NameSummaryProps, InputChangeEvent } from './types';
function NameField({ value, onNameChange }: NameFieldProps) {
  function change(event: InputChangeEvent) { onNameChange(event.currentTarget.value); }
  return <div><label htmlFor="name">名前</label><input id="name" value={value} onChange={change} /></div>;
}
function NameSummary(props: NameSummaryProps) {
  return <section><p id="name-summary">{props.value}</p><p id="length">{props.value.length}</p></section>;
}
export function App() {
  const [name, setName] = useState('');
  return <section><h1>共有する名前</h1><NameField value={name} onNameChange={setName} />
    <NameSummary value={name} /><button id="reset" type="button" onClick={() => setName('')}>やり直し</button></section>;
}`;

describe('Formと共通親Stateの有限契約', () => {
  it('入力/取消と同State由来の検証表示・文字数を追う', () => {
    const result = analyzeControlledForm(form);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts).toEqual({
      usesSingleState: true,
      usesControlledInput: true,
      derivesFromSameState: true,
      preventsSubmit: true,
      sharesParentState: false,
    });
  });
  it('実際に描画する兄弟への値と親setterのcallbackを追う', () => {
    const result = analyzeControlledForm(shared);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts).toEqual({
      usesSingleState: true,
      usesControlledInput: true,
      derivesFromSameState: true,
      preventsSubmit: false,
      sharesParentState: true,
    });
  });
  it('名称/import alias・親callback・Propsの別表記を許容する', () => {
    const result = analyzeControlledForm(
      shared
        .replace('useState }', 'useState as remember }')
        .replace("useState('')", "remember('')")
        .replace(
          'return <section><h1>共有する名前',
          'function update(next: string) { setName(next); }\n  return <section><h1>共有する名前',
        )
        .replace('onNameChange={setName}', 'onNameChange={update}')
        .replaceAll('NameField', 'EditName')
        .replaceAll('EditNameProps', 'NameFieldProps')
        .replaceAll('NameSummary', 'Summary')
        .replaceAll('SummaryProps', 'NameSummaryProps'),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.sharesParentState).toBe(true);
  });
  it('空の子に親の表示を混ぜても共有経路として数えない', () => {
    const source = shared
      .replace(
        'return <div><label htmlFor="name">名前</label><input id="name" value={value} onChange={change} /></div>;',
        'return <div aria-label={value}></div>;',
      )
      .replace(
        'return <section><p id="name-summary">{props.value}</p><p id="length">{props.value.length}</p></section>;',
        'return <section aria-label={props.value}></section>;',
      )
      .replace(
        '<NameSummary value={name} />',
        '<NameSummary value={name} /><input id="name" value={name} onChange={(event: InputChangeEvent) => setName(event.currentTarget.value)} /><p id="name-summary">{name}</p><p id="length">{name.length}</p>',
      );
    const result = analyzeControlledForm(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.usesControlledInput).toBe(true);
    expect(result.facts.derivesFromSameState).toBe(true);
    expect(result.facts.sharesParentState).toBe(false);
  });
  it('表示用のtrimを許容し、入力valueは親の元の値を要求する', () => {
    const result = analyzeControlledForm(shared.replace('{props.value}', '{props.value.trim()}'));
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.sharesParentState).toBe(true);
    expect(
      analyzeControlledForm(shared.replace('value={value}', 'value={value.trim()}')).facts
        .usesControlledInput,
    ).toBe(false);
  });
  it('子の外の文字数はSummaryの経路を満たさない', () => {
    const result = analyzeControlledForm(
      shared
        .replace('<p id="length">{props.value.length}</p>', '')
        .replace(
          '<NameSummary value={name} />',
          '<NameSummary value={name} /><p id="length">{name.length}</p>',
        ),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.facts.sharesParentState).toBe(false);
  });
  it('重複idによる別要素の採点を拒否する', () => {
    expect(
      analyzeControlledForm(
        shared.replace(
          '<NameSummary value={name} />',
          '<NameSummary value={name} /><p id="name-summary">{name}</p>',
        ),
      ).diagnostics.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    form.replace('value={form.name}', 'value="Ada"'),
    shared.replace('<NameSummary value={name}', '<NameSummary value="Ada"'),
    shared.replace('{props.value.length}', '{3}'),
    shared.replace('{props.value.length}', '{false ? props.value.length : 3}'),
    form.replace('event.preventDefault();', ''),
  ])('動作が一度一致しても必要な由来/取消factを満たさない', (source) => {
    const result = analyzeControlledForm(source);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.facts.usesControlledInput &&
        result.facts.derivesFromSameState &&
        (source.includes('name-form')
          ? result.facts.preventsSubmit
          : result.facts.sharesParentState),
    ).toBe(false);
  });
  it.each([
    form.replace("import { useState } from 'react';", "import 'react';"),
    form.replace('useState }', 'useState, useEffect }'),
    form.replace('const missing =', "const [other, setOther] = useState('');\n  const missing ="),
    form.replace(
      'const next = event.currentTarget.value;',
      'const next = document.querySelector("input").value;',
    ),
    form.replace('setForm({ name: next, attempted: false });', 'form.name = next;'),
    form.replace(
      'setForm({ name: next, attempted: false });',
      'setForm(current => ({ ...current, name: event.currentTarget.value }));',
    ),
    form.replace(
      'const next = event.currentTarget.value;',
      'const target = event.currentTarget; const next = target.value;',
    ),
    form.replace('setForm({ name: next, attempted: false });', 'change(event);'),
    form.replace(
      'setForm({ name: next, attempted: false });',
      'setForm(current => setForm(current));',
    ),
    form.replace('form.name.trim().length', 'form.name.constructor'),
    form.replace('form.name.trim().length', '(form.name as any).length'),
    form + '\n// @ts-ignore\n',
  ])('DOM・Event持越し・再帰・二重State・Effect・型弱化を拒否する', (source) => {
    expect(analyzeControlledForm(source).diagnostics.length).toBeGreaterThan(0);
  });
});

it('Form factsは5項目の真偽値のみで、旧profileとの混同を拒否する', () => {
  const input = {
    sessionId: 'form-test',
    revision: 1,
    profile: 'controlled-form-v1' as const,
    files: { 'components.tsx': form },
  };
  const result = {
    status: 'ready',
    files: { 'components.js': '' },
    sourceMaps: { 'components.js': '' },
    facts: analyzeControlledForm(form).facts,
  };
  expect(isReactCompileInput(input)).toBe(true);
  expect(isReactCompileResult(result, input)).toBe(true);
  for (const facts of [
    undefined,
    { ...result.facts, usesSingleState: 'true' },
    { ...result.facts, extra: true },
    { usesSingleState: true },
  ]) {
    expect(isReactCompileResult({ ...result, facts }, input)).toBe(false);
  }
  for (const profile of [
    'props-card-v1',
    'static-components-v1',
    'interactive-state-v1',
  ] as const) {
    expect(isReactCompileResult(result, { ...input, profile })).toBe(false);
  }
});

it('同じ禁止Event読取りを複数の検査経路で見ても同位置の診断は1件にする', () => {
  const source = form.replace(
    'setForm({ name: next, attempted: false });',
    'setForm(current => ({ ...current, name: event.currentTarget.value, attempted: false }));',
  );
  const diagnostics = analyzeControlledForm(source).diagnostics;
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]?.code).toBe(0);
});
