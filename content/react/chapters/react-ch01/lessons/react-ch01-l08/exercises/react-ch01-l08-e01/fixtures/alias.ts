import type { FormState as State, FormAction as Action } from './types';

export function reduceForm(previous: State, operation: Action): State {
  if (operation.type === 'nameChanged') {
    return { name: operation.nextName, attempted: false };
  }
  if (operation.type === 'submitted') {
    return { ...previous, attempted: true };
  }
  return { name: '', attempted: false };
}
