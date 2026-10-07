import { STATIC_COMPONENTS_MAIN } from './staticComponentsScaffold';
import { INTERACTIVE_STATE_HTML } from './interactiveStateScaffold';

export const CONTROLLED_FORM_MAIN = STATIC_COMPONENTS_MAIN;
export const CONTROLLED_FORM_HTML = INTERACTIVE_STATE_HTML.replace(
  '操作でStateを更新する',
  '入力と共有Stateを確かめる',
).replace('button {', 'button,\n      input {');
export const CONTROLLED_FORM_TYPES = `import type { ChangeEvent, SubmitEvent } from 'react';

export type InputChangeEvent = ChangeEvent<HTMLInputElement>;
export type FormSubmitEvent = SubmitEvent<HTMLFormElement>;

export interface FormState {
  readonly name: string;
  readonly attempted: boolean;
}

export interface NameFieldProps {
  readonly value: string;
  readonly onNameChange: (next: string) => void;
}

export interface NameSummaryProps {
  readonly value: string;
}
`;

/** Event型とreadonlyなState/Propsを固定し、入力値以外のDOM能力を学習者へ渡さない。 */
export function isControlledFormScaffold(files: Readonly<Record<string, string>>): boolean {
  return (
    files['main.tsx']?.trim() === CONTROLLED_FORM_MAIN.trim() &&
    files['types.ts']?.trim() === CONTROLLED_FORM_TYPES.trim()
  );
}

/** 保存・Import・Compiler・採点で同じ4Fileを要求する。 */
export function isControlledFormWorkspace(files: Readonly<Record<string, string>>): boolean {
  return (
    Object.keys(files).sort().join(',') === 'components.tsx,index.html,main.tsx,types.ts' &&
    isControlledFormScaffold(files) &&
    files['index.html']?.trim() === CONTROLLED_FORM_HTML.trim()
  );
}
