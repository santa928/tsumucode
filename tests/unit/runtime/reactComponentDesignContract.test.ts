import { expect, it } from 'vitest';
import {
  isReactCompileInput,
  isReactCompileResult,
} from '../../../src/adapters/runtime/react/compilerContract';
import { appOwnsTemperature } from '../../fixtures/reactComponentDesignSources';

it('温度の専用profileを既存の厳密なWorker境界で受理する', () => {
  const input = {
    sessionId: 'temperature-test',
    revision: 1,
    profile: 'component-design-v1',
    files: { 'components.tsx': appOwnsTemperature },
  };
  // 現在のprofile拒否で意味のあるREDになる。未知profileの開放を求めない。
  expect(isReactCompileInput(input)).toBe(true);
  expect(isReactCompileInput({ ...input, profile: 'component-design-v2' })).toBe(false);
  if (!isReactCompileInput(input)) return;
  const result = {
    status: 'ready',
    files: { 'components.js': '' },
    sourceMaps: { 'components.js': '' },
    facts: { rendersAuthoredDisplay: true, usesInteractiveState: true },
  };
  expect(isReactCompileResult(result, input)).toBe(true);
  for (const facts of [
    undefined,
    {},
    { rendersAuthoredDisplay: true },
    { ...result.facts, extra: true },
    { ...result.facts, usesInteractiveState: 'true' },
  ]) {
    expect(isReactCompileResult({ ...result, facts }, input)).toBe(false);
  }
  expect(isReactCompileResult(result, { ...input, profile: 'interactive-state-v1' })).toBe(false);
  expect(isReactCompileResult(result, { ...input, profile: 'static-components-v1' })).toBe(false);
});
