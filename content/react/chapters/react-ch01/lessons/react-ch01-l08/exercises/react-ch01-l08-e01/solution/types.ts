import type { ChangeEvent, SubmitEvent } from 'react';

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
