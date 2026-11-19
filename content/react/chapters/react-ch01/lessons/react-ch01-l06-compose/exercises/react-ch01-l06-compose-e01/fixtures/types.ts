import type { ChangeEvent, SubmitEvent } from 'react';

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
