import type { RunnerAdapter, RunnerLanguageId } from './contracts';

export type RunnerFactory = () => RunnerAdapter;

const MAX_RUNNER_ID_LENGTH = 256;

/** Runner IDを空でないbounded文字列へ限定する。 */
function assertRunnerId(id: RunnerLanguageId): void {
  if (id.trim().length === 0 || id.length > MAX_RUNNER_ID_LENGTH) {
    throw new Error('Runner ID must be a non-empty bounded string');
  }
}

/** 信頼境界を越えたfactory出力がRunner公開契約の形を持つか確認する。 */
function isRunnerAdapter(value: unknown): value is RunnerAdapter {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof RunnerAdapter, unknown>>;
  return (
    typeof candidate.languageId === 'string' &&
    typeof candidate.prepare === 'function' &&
    typeof candidate.render === 'function' &&
    typeof candidate.requestSnapshot === 'function' &&
    typeof candidate.dispose === 'function'
  );
}

/** factoryを一度生成して公開契約と登録IDの一致を検証する。 */
function createCheckedRunner(id: RunnerLanguageId, factory: RunnerFactory): RunnerAdapter {
  const runner: unknown = factory();
  if (!isRunnerAdapter(runner)) {
    throw new Error(`Runner factory returned an invalid adapter: ${id}`);
  }
  if (runner.languageId !== id) {
    throw new Error(`Runner languageId mismatch: expected ${id}, received ${runner.languageId}`);
  }
  return runner;
}

/** CourseのRunner IDをfactoryへ解決し、利用側から言語別の分岐を除く。 */
export class RunnerRegistry {
  readonly #factories = new Map<RunnerLanguageId, RunnerFactory>();

  /** 指定IDが登録済みか、factoryを生成せずに返す。 */
  has(id: RunnerLanguageId): boolean {
    return this.#factories.has(id);
  }

  /** IDごとに一つだけRunner factoryを登録する。 */
  register(id: RunnerLanguageId, factory: RunnerFactory): void {
    assertRunnerId(id);
    if (typeof factory !== 'function') throw new Error('Runner factory must be a function');
    if (this.#factories.has(id)) throw new Error(`Runner already registered: ${id}`);
    createCheckedRunner(id, factory);
    this.#factories.set(id, factory);
  }

  /** 登録済みfactoryから新しいRunnerを生成し、language契約も検証する。 */
  create(id: RunnerLanguageId): RunnerAdapter {
    assertRunnerId(id);
    const factory = this.#factories.get(id);
    if (factory === undefined) throw new Error(`Runner not registered: ${id}`);
    return createCheckedRunner(id, factory);
  }
}
