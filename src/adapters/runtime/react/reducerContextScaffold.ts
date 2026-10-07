import { CONTROLLED_FORM_MAIN, CONTROLLED_FORM_HTML } from './controlledFormScaffold';
import type { ReactProfile } from './compilerContract';

export const REDUCER_COMPONENTS = `import { useReducer } from 'react';
import type { InputChangeEvent, FormSubmitEvent } from './types';
import { reduceForm } from './reducer';
export function App() {
  const [form, dispatch] = useReducer(reduceForm, { name: '', attempted: false });
  const missing = form.name.trim().length === 0;
  const message = form.attempted
    ? missing
      ? '名前を入力してください'
      : '送信を受け付けました'
    : '入力中';
  function change(event: InputChangeEvent) {
    const next = event.currentTarget.value;
    dispatch({ type: 'nameChanged', nextName: next });
  }
  function submit(event: FormSubmitEvent) {
    event.preventDefault();
    dispatch({ type: 'submitted' });
  }
  return (
    <section>
      <h1>名前のForm</h1>
      <form id="name-form" onSubmit={submit}>
        <label htmlFor="name">名前</label>
        <input
          id="name"
          value={form.name}
          onChange={change}
          aria-describedby="message"
          aria-invalid={form.attempted && missing}
        />
        <p id="length">{form.name.length}</p>
        <p id="message" role="status">
          {message}
        </p>
        <button id="submit" type="submit">
          送信
        </button>
        <button id="reset" type="button" onClick={() => dispatch({ type: 'reset' })}>
          やり直し
        </button>
      </form>
    </section>
  );
}
`;
export const NAME_CONTEXT = `import { createContext } from 'react';
import type { NameContextValue } from './types';

export const NameContext = createContext<NameContextValue | null>(null);
`;
export const CONTEXT_MAIN = `import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { NameContext } from './nameContext';
import { NameField, NameSummary } from './components';

function App() {
  const [name, setName] = useState('');
  return (
    <section>
      <h1>Contextで共有する名前</h1>
      <NameContext.Provider value={{ value: name, onNameChange: setName }}>
        <NameField />
        <NameSummary />
      </NameContext.Provider>
      <button id="reset" type="button" onClick={() => setName('')}>
        やり直し
      </button>
    </section>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('表示先が見つかりません');
createRoot(container).render(<App />);
`;

export const REDUCER_TYPES = `import type { ChangeEvent, SubmitEvent } from 'react';

export type InputChangeEvent = ChangeEvent<HTMLInputElement>;
export type FormSubmitEvent = SubmitEvent<HTMLFormElement>;

export interface FormState {
  readonly name: string;
  readonly attempted: boolean;
}

export type FormAction =
  | { readonly type: 'nameChanged'; readonly nextName: string }
  | { readonly type: 'submitted' }
  | { readonly type: 'reset' };
`;
export const CONTEXT_TYPES = `import type { ChangeEvent } from 'react';

export type InputChangeEvent = ChangeEvent<HTMLInputElement>;

export interface NameContextValue {
  readonly value: string;
  readonly onNameChange: (next: string) => void;
}
`;

/** Stateの所有者・dispatch・ProviderとContextの同一性を固定する。 */
export function isReducerContextScaffold(
  files: Readonly<Record<string, string>>,
  profile: ReactProfile,
): boolean {
  const fixed =
    profile === 'reducer-form-v1'
      ? {
          'components.tsx': REDUCER_COMPONENTS,
          'main.tsx': CONTROLLED_FORM_MAIN,
          'types.ts': REDUCER_TYPES,
        }
      : profile === 'context-sharing-v1'
        ? { 'main.tsx': CONTEXT_MAIN, 'nameContext.ts': NAME_CONTEXT, 'types.ts': CONTEXT_TYPES }
        : undefined;
  return (
    !!fixed &&
    Object.entries(fixed).every(([file, source]) => files[file]?.trim() === source.trim())
  );
}

/** 課題ごとに編集責務を1Fileへ絞り、保存・Import・採点の境界を揃える。 */
export function isReducerContextWorkspace(
  files: Readonly<Record<string, string>>,
  profile: ReactProfile,
): boolean {
  const expected =
    profile === 'reducer-form-v1'
      ? 'components.tsx,index.html,main.tsx,reducer.ts,types.ts'
      : 'components.tsx,index.html,main.tsx,nameContext.ts,types.ts';
  return (
    Object.keys(files).sort().join(',') === expected &&
    isReducerContextScaffold(files, profile) &&
    files['index.html']?.trim() === CONTROLLED_FORM_HTML.trim()
  );
}
