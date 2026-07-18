/** open stringのcontent languageをCodeMirror Extensionへ遅延解決する。 */
import type { Extension } from '@codemirror/state';

export type EditorLanguageFactory = () => Extension;

/** UIへ言語分岐を持ち込まず、将来言語を登録だけで追加できるRegistry。 */
export class EditorLanguageRegistry {
  readonly #factories = new Map<string, EditorLanguageFactory>();

  /** 指定IDが既に登録済みか、副作用なしで返す。 */
  has(id: string): boolean {
    return this.#factories.has(id);
  }

  /** 未登録IDへfactoryを登録し、既存定義の意図しない上書きを拒否する。 */
  register(id: string, factory: EditorLanguageFactory): void {
    if (this.#factories.has(id)) {
      throw new Error(`Editor language already registered: ${id}`);
    }
    this.#factories.set(id, factory);
  }

  /** 登録済みextensionを生成し、未知IDはplain text相当の空Extensionへ解決する。 */
  extensionFor(id: string): Extension {
    return this.#factories.get(id)?.() ?? [];
  }
}
