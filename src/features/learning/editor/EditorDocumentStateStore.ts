/** File別EditorStateを保持し、外部Draft同期をUndo履歴から隔離する。 */
import { Transaction, type EditorState } from '@codemirror/state';

export interface EditorDocumentInput {
  readonly path: string;
  readonly language: string;
  readonly content: string;
}

interface StoredEditorDocument {
  readonly language: string;
  readonly state: EditorState;
}

/** FileごとのCodeMirror Stateを保存し、外部DraftをHistoryへ積まず同期する。 */
export class EditorDocumentStateStore {
  readonly #documents = new Map<string, StoredEditorDocument>();

  /** 現在のFile・LanguageとEditorStateを次回の復元用に保存する。 */
  save(path: string, language: string, state: EditorState): void {
    this.#documents.set(path, { language, state });
  }

  /** 同じFile・LanguageのStateを復元し、外部更新だけをUndo対象外で反映する。 */
  restore(input: EditorDocumentInput, create: () => EditorState): EditorState {
    const stored = this.#documents.get(input.path);
    if (stored === undefined || stored.language !== input.language) return create();
    if (stored.state.doc.toString() === input.content) return stored.state;

    return stored.state.update({
      changes: { from: 0, to: stored.state.doc.length, insert: input.content },
      annotations: Transaction.addToHistory.of(false),
    }).state;
  }

  /** Editor破棄時に保持中の全File Stateを解放する。 */
  clear(): void {
    this.#documents.clear();
  }
}
