import type { FormState, FormAction } from './types';

export function reduceForm(state: FormState, action: FormAction): FormState {
  if (action.type === 'nameChanged') {
    return { name: action.nextName, attempted: false };
  }
  if (action.type === 'submitted') {
    console.log(state);
    return { ...state, attempted: true };
  }
  return { name: '', attempted: false };
}
