import type { ReadOnlyPreviewAdapter, RunnerLanguageId } from './contracts';

export type ReadOnlyPreviewFactory = () => ReadOnlyPreviewAdapter;

const MAX_PREVIEW_ID_LENGTH = 256;

/** Preview IDを空でないbounded文字列へ限定する。 */
function assertPreviewId(id: RunnerLanguageId): void {
  if (id.trim().length === 0 || id.length > MAX_PREVIEW_ID_LENGTH) {
    throw new Error('Read-only Preview ID must be a non-empty bounded string');
  }
}

/** factory出力がread-only最小portを満たすか確認する。 */
function isReadOnlyPreviewAdapter(value: unknown): value is ReadOnlyPreviewAdapter {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof ReadOnlyPreviewAdapter, unknown>>;
  return (
    typeof candidate.languageId === 'string' &&
    typeof candidate.prepare === 'function' &&
    typeof candidate.render === 'function' &&
    typeof candidate.dispose === 'function'
  );
}

/** factoryを一度生成し、公開契約と登録IDの一致を検証する。 */
function createCheckedPreview(
  id: RunnerLanguageId,
  factory: ReadOnlyPreviewFactory,
): ReadOnlyPreviewAdapter {
  const preview: unknown = factory();
  if (!isReadOnlyPreviewAdapter(preview)) {
    throw new Error(`Read-only Preview factory returned an invalid adapter: ${id}`);
  }
  if (preview.languageId !== id) {
    throw new Error(
      `Read-only Preview languageId mismatch: expected ${id}, received ${preview.languageId}`,
    );
  }
  return preview;
}

/** CourseのRunner IDを静的Preview adapterへ解決するregistry。 */
export class ReadOnlyPreviewRegistry {
  readonly #factories = new Map<RunnerLanguageId, ReadOnlyPreviewFactory>();

  /** IDごとに一つだけread-only factoryを登録する。 */
  register(id: RunnerLanguageId, factory: ReadOnlyPreviewFactory): void {
    assertPreviewId(id);
    if (typeof factory !== 'function') {
      throw new Error('Read-only Preview factory must be a function');
    }
    if (this.#factories.has(id)) {
      throw new Error(`Read-only Preview already registered: ${id}`);
    }
    createCheckedPreview(id, factory);
    this.#factories.set(id, factory);
  }

  /** 登録済みfactoryから新しい静的Preview adapterを生成する。 */
  create(id: RunnerLanguageId): ReadOnlyPreviewAdapter {
    assertPreviewId(id);
    const factory = this.#factories.get(id);
    if (factory === undefined) throw new Error(`Read-only Preview not registered: ${id}`);
    return createCheckedPreview(id, factory);
  }
}
