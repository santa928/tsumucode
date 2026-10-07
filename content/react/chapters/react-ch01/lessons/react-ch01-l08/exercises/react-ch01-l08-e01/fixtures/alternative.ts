import type { FormState, FormAction } from './types';

export function reduceForm(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'nameChanged':
      return { name: action.nextName, attempted: false };
    case 'submitted':
      return { name: state.name, attempted: true };
    case 'reset':
      return { name: '', attempted: false };
  }
}
