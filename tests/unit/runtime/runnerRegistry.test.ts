import { describe, expect, it, vi } from 'vitest';
import { RunnerRegistry } from '../../../src/core/runtime/RunnerRegistry';
import { FixtureRunner } from '../../fixtures/fixtureRunner';

describe('RunnerRegistry', () => {
  it('IDとfactoryだけで第2言語Runnerを生成できる', () => {
    const registry = new RunnerRegistry();
    const factory = vi.fn(() => new FixtureRunner());

    registry.register('fixture', factory);

    expect(registry.create('fixture')).toBeInstanceOf(FixtureRunner);
    expect(registry.create('fixture')).toBeInstanceOf(FixtureRunner);
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('空ID・重複登録・未登録IDを決定的に拒否する', () => {
    const registry = new RunnerRegistry();

    expect(() => {
      registry.register('', () => new FixtureRunner());
    }).toThrow('non-empty');
    registry.register('fixture', () => new FixtureRunner());
    expect(() => {
      registry.register('fixture', () => new FixtureRunner());
    }).toThrow('already registered');
    expect(() => registry.create('unknown')).toThrow('not registered');
  });

  it('factoryが登録IDと異なるlanguageIdを返したら生成物を拒否する', () => {
    const registry = new RunnerRegistry();

    expect(() => {
      registry.register('expected', () => new FixtureRunner());
    }).toThrow('languageId mismatch');
    expect(() => {
      registry.register('expected', () => ({
        languageId: 'expected',
        prepare: vi.fn(),
        render: vi.fn(),
        requestSnapshot: vi.fn(),
        dispose: vi.fn(),
      }));
    }).not.toThrow();
  });

  it('factory以外の登録値とRunnerでない生成物を境界で拒否する', () => {
    const registry = new RunnerRegistry();

    expect(() => {
      registry.register('invalid-factory', null as never);
    }).toThrow('factory must be a function');
    expect(() => {
      registry.register('invalid-runner', () => null as never);
    }).toThrow('factory returned an invalid adapter');
  });
});
