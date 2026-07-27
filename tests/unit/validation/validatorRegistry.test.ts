import { describe, expect, it, vi } from 'vitest';
import type { ValidatorAdapter } from '../../../src/core/validation/contracts';
import { ValidatorRegistry } from '../../../src/core/validation/ValidatorRegistry';

/** Registry境界テスト用の最小Validatorを生成する。 */
function validator(): ValidatorAdapter {
  return {
    buildSnapshotPolicy: () => ({
      selectors: [],
      attributes: [],
      computedStyles: [],
      focusVisibleSelectors: [],
      focusVisibleComputedStyles: [],
      includeAllElements: false,
    }),
    validate: async (context) => ({
      exerciseId: context.exerciseId,
      executionRevision: null,
      status: 'system-error',
      checks: [],
      passedRequirementIds: [],
      diagnostics: [],
      evaluatedAt: context.now,
    }),
  };
}

describe('ValidatorRegistry', () => {
  it('登録済みIDを生成せずに判定できる', () => {
    const registry = new ValidatorRegistry();

    expect(registry.has('html-css')).toBe(false);
    registry.register('html-css', validator);
    expect(registry.has('html-css')).toBe(true);
  });

  it('登録時にfactoryをprobeしcreateごとに新しいValidatorを再検証する', () => {
    const registry = new ValidatorRegistry();
    const factory = vi.fn(validator);

    registry.register('html-css', factory);

    expect(registry.create('html-css')).not.toBe(registry.create('html-css'));
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('空ID・長大ID・重複・未登録IDを拒否する', () => {
    const registry = new ValidatorRegistry();

    expect(() => {
      registry.register('', validator);
    }).toThrow(/non-empty/i);
    expect(() => {
      registry.register('x'.repeat(257), validator);
    }).toThrow(/bounded/i);
    registry.register('html-css', validator);
    expect(() => {
      registry.register('html-css', validator);
    }).toThrow(/already registered/i);
    expect(() => registry.create('unknown')).toThrow(/not registered/i);
  });

  it('非factoryと公開契約を満たさない生成物を拒否し登録を汚染しない', () => {
    const registry = new ValidatorRegistry();

    expect(() => {
      registry.register('html-css', null as never);
    }).toThrow(/factory must be a function/i);
    expect(() => {
      registry.register('html-css', () => null as never);
    }).toThrow(/invalid adapter/i);
    expect(() => {
      registry.register('html-css', validator);
    }).not.toThrow();
  });

  it('登録後にfactory出力が壊れた場合もcreate境界で拒否する', () => {
    const outputs: unknown[] = [validator(), null];
    const registry = new ValidatorRegistry();
    registry.register('html-css', () => outputs.shift() as ValidatorAdapter);

    expect(() => registry.create('html-css')).toThrow(/invalid adapter/i);
  });
});
