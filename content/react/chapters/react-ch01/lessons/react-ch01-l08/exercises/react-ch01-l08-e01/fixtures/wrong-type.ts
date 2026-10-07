import type { FormState, FormAction } from './types';

export function reduceForm(state: FormState, action: FormAction): FormState {
  if (action.type === 'nameChanged') {
    return { name: true, attempted: false };
  }
  if (action.type === 'submitted') {
    return { ...state, attempted: true };
  }
  return { name: '', attempted: false };
}
