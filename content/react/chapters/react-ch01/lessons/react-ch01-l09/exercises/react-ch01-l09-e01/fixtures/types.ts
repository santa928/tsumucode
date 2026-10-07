import type { ChangeEvent } from 'react';

export type InputChangeEvent = ChangeEvent<HTMLInputElement>;

export interface NameContextValue {
  readonly value: string;
  readonly onNameChange: (next: string) => void;
}
