/** Runtime・Validation・Persistence 間の公開型境界を固定する compile-time contract test。 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  InteractionCheckpointResult,
  InteractionRequest,
  InteractionResult,
  PreviewSnapshot,
  RunnerAdapter,
  RunnerInput,
} from '../../../src/core/runtime/contracts';
import type {
  ValidationContext,
  ValidationResult,
  ValidatorAdapter,
  ValidatorRule,
} from '../../../src/core/validation/contracts';
import type { ProgressBundle, ProgressRepository } from '../../../src/core/persistence/contracts';
import { CURRENT_PROGRESS_SCHEMA_VERSION } from '../../../src/core/persistence/contracts';

describe('学習ランタイム公開契約', () => {
  it('Runner、Validator、Repository の境界を固定する', () => {
    expect(CURRENT_PROGRESS_SCHEMA_VERSION).toBe(2);
    expectTypeOf<RunnerAdapter['render']>().parameter(0).toEqualTypeOf<RunnerInput>();
    expectTypeOf<
      RunnerAdapter['requestSnapshot']
    >().returns.resolves.toEqualTypeOf<PreviewSnapshot>();
    expectTypeOf<NonNullable<RunnerAdapter['interact']>>()
      .parameter(0)
      .toEqualTypeOf<InteractionRequest>();
    expectTypeOf<
      NonNullable<RunnerAdapter['interact']>
    >().returns.resolves.toEqualTypeOf<InteractionResult>();
    expectTypeOf<ValidationContext['interactionCheckpoints']>().toExtend<
      Readonly<Record<string, readonly InteractionCheckpointResult[]>>
    >();
    expectTypeOf<ValidatorAdapter['validate']>().parameter(0).toEqualTypeOf<ValidationContext>();
    expectTypeOf<ValidatorAdapter['validate']>().returns.resolves.toEqualTypeOf<ValidationResult>();
    expectTypeOf<ValidatorRule>().toExtend<{ readonly id: string }>();
    expectTypeOf<ProgressRepository['snapshot']>().returns.resolves.toExtend<{
      readonly courses: Readonly<Record<string, unknown>>;
    }>();
    expectTypeOf<ProgressBundle>().toExtend<{
      readonly schemaVersion: number;
      readonly integrity: { readonly algorithm: 'SHA-256'; readonly digest: string };
    }>();
    expect(true).toBe(true);
  });
});
