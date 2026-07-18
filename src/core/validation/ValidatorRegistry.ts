import type { ValidatorAdapter } from './contracts';

export type ValidatorFactory = () => ValidatorAdapter;

const MAX_VALIDATOR_ID_LENGTH = 256;

/** Validator IDを空でないbounded文字列へ限定する。 */
function assertValidatorId(id: string): void {
  if (id.trim().length === 0 || id.length > MAX_VALIDATOR_ID_LENGTH) {
    throw new Error('Validator ID must be a non-empty bounded string');
  }
}

/** 信頼境界を越えたfactory出力がValidator公開契約の形を持つか確認する。 */
function isValidatorAdapter(value: unknown): value is ValidatorAdapter {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof ValidatorAdapter, unknown>>;
  return (
    typeof candidate.buildSnapshotPolicy === 'function' && typeof candidate.validate === 'function'
  );
}

/** factoryを生成し、利用前に公開契約を再検証する。 */
function createCheckedValidator(id: string, factory: ValidatorFactory): ValidatorAdapter {
  const validator: unknown = factory();
  if (!isValidatorAdapter(validator)) {
    throw new Error(`Validator factory returned an invalid adapter: ${id}`);
  }
  return validator;
}

/** CourseのValidator IDをfactoryへ解決し、言語別の分岐を利用側から除く。 */
export class ValidatorRegistry {
  readonly #factories = new Map<string, ValidatorFactory>();

  /** 指定IDが登録済みか、factoryを生成せずに返す。 */
  has(id: string): boolean {
    return this.#factories.has(id);
  }

  /** IDごとに一つだけValidator factoryを登録する。 */
  register(id: string, factory: ValidatorFactory): void {
    assertValidatorId(id);
    if (typeof factory !== 'function') throw new Error('Validator factory must be a function');
    if (this.#factories.has(id)) throw new Error(`Validator already registered: ${id}`);
    createCheckedValidator(id, factory);
    this.#factories.set(id, factory);
  }

  /** 登録済みfactoryから新しいValidatorを生成し、公開契約も検証する。 */
  create(id: string): ValidatorAdapter {
    assertValidatorId(id);
    const factory = this.#factories.get(id);
    if (factory === undefined) throw new Error(`Validator not registered: ${id}`);
    return createCheckedValidator(id, factory);
  }
}
