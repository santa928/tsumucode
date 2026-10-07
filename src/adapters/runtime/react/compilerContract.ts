import {
  isTypeScriptCompileInput,
  isTypeScriptCompileResult,
  type TypeScriptCompileInput,
} from '../typescript/workerContract';
import type { TypeScriptCompileResult } from '../typescript/compileTypeScript';
import type { InteractiveStateFacts } from './checkInteractiveStateSource';
import type { StaticComponentFacts } from './checkStaticComponentsSource';
import type { ControlledFormFacts } from './checkControlledFormSource';
import type { ReducerFacts } from './checkReducerSource';
import type { ContextFacts } from './checkContextSource';

export type ReactProfile =
  | 'props-card-v1'
  | 'static-components-v1'
  | 'interactive-state-v1'
  | 'controlled-form-v1'
  | 'reducer-form-v1'
  | 'context-sharing-v1';
export interface ReactCompileInput extends TypeScriptCompileInput {
  readonly profile?: ReactProfile;
}
export type ReactCompileResult =
  | Exclude<TypeScriptCompileResult, { status: 'ready' }>
  | (Extract<TypeScriptCompileResult, { status: 'ready' }> & {
      readonly facts?:
        | StaticComponentFacts
        | InteractiveStateFacts
        | ControlledFormFacts
        | ReducerFacts
        | ContextFacts;
    });

/** 既存の容量・identity上限を保ち、TSXだけを追加する。予約moduleは入力できない。 */
export function isReactCompileInput(value: unknown): value is ReactCompileInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort().join(',');
  if (keys !== 'files,revision,sessionId' && keys !== 'files,profile,revision,sessionId')
    return false;
  if (
    Object.hasOwn(input, 'profile') &&
    input['profile'] !== 'props-card-v1' &&
    input['profile'] !== 'static-components-v1' &&
    input['profile'] !== 'interactive-state-v1' &&
    input['profile'] !== 'controlled-form-v1' &&
    input['profile'] !== 'reducer-form-v1' &&
    input['profile'] !== 'context-sharing-v1'
  )
    return false;
  if (!input.files || typeof input.files !== 'object' || Array.isArray(input.files)) return false;
  const entries = Object.entries(input.files as Record<string, unknown>);
  if (entries.some(([name]) => !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.tsx?$/u.test(name)))
    return false;
  const normalized: [string, unknown][] = entries.map(([name, source]) => [
    name.replace(/\.tsx$/u, '.ts'),
    source,
  ]);
  if (new Set(normalized.map(([name]) => name)).size !== entries.length) return false;
  return isTypeScriptCompileInput({
    sessionId: input['sessionId'],
    revision: input['revision'],
    files: Object.fromEntries<unknown>(normalized),
  });
}

/** TSXの出力名を既存のstrict結果guardへ対応させ、余分なemitを拒否する。 */
export function isReactCompileResult(
  value: unknown,
  input: ReactCompileInput,
): value is ReactCompileResult {
  let compiled = value;
  if (
    [
      'static-components-v1',
      'interactive-state-v1',
      'controlled-form-v1',
      'reducer-form-v1',
      'context-sharing-v1',
    ].includes(input.profile ?? '') &&
    value &&
    typeof value === 'object'
  ) {
    const result = value as Record<string, unknown>;
    if (result['status'] === 'ready') {
      if (Object.keys(result).sort().join(',') !== 'facts,files,sourceMaps,status') return false;
      const facts = result['facts'];
      if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return false;
      const fields = facts as Record<string, unknown>;
      if (
        Object.keys(fields).sort().join(',') !==
          (input.profile === 'reducer-form-v1'
            ? 'changesNameFromAction,resetsInitialState,returnsFreshState,submitsCurrentName,usesPureReducer'
            : input.profile === 'context-sharing-v1'
              ? 'derivesFromProvidedValue,forwardsProvidedUpdate,readsSameProvidedValue'
              : input.profile === 'controlled-form-v1'
                ? 'derivesFromSameState,preventsSubmit,sharesParentState,usesControlledInput,usesSingleState'
                : input.profile === 'interactive-state-v1'
                  ? 'queuesTwoIncrements,updatesStateFromEvent,usesImmutableUpdates,usesStableItemKeys,usesState'
                  : 'rendersAssignedPairs,rendersReceivedChildren,reusesCardWithDistinctProps') ||
        !Object.values(fields).every((field) => typeof field === 'boolean')
      )
        return false;
      compiled = {
        status: result['status'],
        files: result['files'],
        sourceMaps: result['sourceMaps'],
      };
    }
  }
  return isTypeScriptCompileResult(compiled, {
    sessionId: input.sessionId,
    revision: input.revision,
    files: Object.fromEntries(
      Object.entries(input.files).map(([name, source]) => [name.replace(/\.tsx$/u, '.ts'), source]),
    ),
  });
}
