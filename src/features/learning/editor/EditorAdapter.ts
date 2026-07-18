/** Code editor固有のimperative APIをReact UIから分離する公開契約。 */
import type { EditorCursor } from '../../../core/persistence/contracts';
import type { RunnerDiagnostic } from '../../../core/runtime/contracts';

export interface EditorMountInput {
  readonly parent: HTMLElement;
  readonly path: string;
  readonly language: string;
  readonly content: string;
  readonly cursor?: EditorCursor;
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly onChange: (content: string) => void;
  readonly onCursorChange: (cursor: EditorCursor) => void;
}

export interface EditorHandle {
  /** 表示file・言語・内容・診断を親のcontrolled stateへ同期する。 */
  setDocument(input: Pick<EditorMountInput, 'path' | 'language' | 'content' | 'diagnostics'>): void;
  /** 親が保持するcursorを現在documentの有効範囲へ復元する。 */
  setSelection(cursor?: EditorCursor): void;
  /** 編集面へkeyboard focusを移す。 */
  focus(): void;
  /** editorのDOM・listener・内部資源を解放する。複数回呼び出しても安全。 */
  destroy(): void;
}

export interface EditorAdapter {
  /** 指定hostへeditorを1つ生成し、以後のimperative操作handleを返す。 */
  mount(input: EditorMountInput): EditorHandle;
}
