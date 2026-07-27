/** CodeMirrorの状態、File別履歴、DOM副作用をEditorAdapter内部へ閉じ込める。 */
import { EditorSelection, EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from '@codemirror/view';
import type { EditorCursor } from '../../../core/persistence/contracts';
import type { EditorAdapter, EditorMountInput } from './EditorAdapter';
import { EditorDocumentStateStore, type EditorDocumentInput } from './EditorDocumentStateStore';
import type { EditorLanguageRegistry } from './EditorLanguageRegistry';
import { createEditorExperienceExtensions } from './createEditorExperienceExtensions';
import { createHtmlCssEditorLanguageRegistry } from './htmlCssEditorLanguages';

/** cursor offsetを現在documentの両端を含む有効範囲へ丸める。 */
function clampOffset(offset: number, documentLength: number): number {
  return Math.max(0, Math.min(offset, documentLength));
}

/** 入力cursorを現在documentへ安全に適用できるCodeMirror selectionへ変換する。 */
function selectionFor(cursor: EditorCursor | undefined, documentLength: number) {
  if (!cursor) return undefined;
  return EditorSelection.single(
    clampOffset(cursor.anchor, documentLength),
    clampOffset(cursor.head, documentLength),
  );
}

/** File名と操作説明をCodeMirrorのcontenteditable面へ付与する。 */
function editorAttributes(
  path: string,
  descriptionId: string | undefined,
): Readonly<Record<string, string>> {
  return {
    'aria-label': `${path} のコードエディター`,
    ...(descriptionId ? { 'aria-describedby': descriptionId } : {}),
    tabindex: '0',
    spellcheck: 'false',
  };
}

/** Scroll親をTab順から外し、文字入力面だけを単一のKeyboard入口にする。 */
function configureEditorFocusTarget(view: EditorView): void {
  view.scrollDOM.removeAttribute('tabindex');
  view.contentDOM.tabIndex = 0;
}

/** mount入力からState生成に必要なDocument情報だけを取り出す。 */
function initialDocument(input: EditorMountInput): EditorDocumentInput {
  return { path: input.path, language: input.language, content: input.content };
}

/** CodeMirrorのimperative APIをUI・Repository非依存のEditorAdapterへ変換する。 */
export function createCodeMirrorEditor(
  registry: EditorLanguageRegistry = createHtmlCssEditorLanguageRegistry(),
): EditorAdapter {
  return {
    mount(input) {
      let currentPath = input.path;
      let currentLanguage = input.language;
      let highestControlledRevision = input.contentRevision;
      let restoring = false;
      let destroyed = false;
      const documents = new EditorDocumentStateStore();
      const pendingLocalRevisionsByPath = new Map<string, Set<number>>();

      /** 親が受理したローカル編集revisionだけをFile単位で追跡する。 */
      const recordLocalRevision = (path: string, revision: number | undefined): void => {
        if (
          revision === undefined ||
          !Number.isInteger(revision) ||
          revision <= highestControlledRevision
        ) {
          return;
        }
        const revisions = pendingLocalRevisionsByPath.get(path) ?? new Set<number>();
        revisions.add(revision);
        pendingLocalRevisionsByPath.set(path, revisions);
      };

      /** 遅着echoをrevisionで拒否し、新しい外部更新は値に関係なく受理する。 */
      const shouldApplyControlledDocument = (
        document: EditorDocumentInput & Pick<EditorMountInput, 'contentRevision'>,
      ): boolean => {
        if (document.contentRevision < highestControlledRevision) return false;
        const pending = pendingLocalRevisionsByPath.get(document.path);
        const hasNewerLocalRevision = [...(pending ?? [])].some(
          (revision) => revision > document.contentRevision,
        );
        highestControlledRevision = Math.max(highestControlledRevision, document.contentRevision);
        for (const [path, revisions] of pendingLocalRevisionsByPath) {
          for (const revision of revisions) {
            if (revision <= document.contentRevision) revisions.delete(revision);
          }
          if (revisions.size === 0) pendingLocalRevisionsByPath.delete(path);
        }
        return !hasNewerLocalRevision;
      };

      /** 言語・入力支援・Accessibilityを含む独立したFile Stateを生成する。 */
      const createState = (document: EditorDocumentInput, cursor?: EditorCursor): EditorState => {
        const initialSelection = selectionFor(cursor, document.content.length);
        return EditorState.create({
          doc: document.content,
          ...(initialSelection ? { selection: initialSelection } : {}),
          extensions: [
            ...createEditorExperienceExtensions(),
            registry.extensionFor(document.language),
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightActiveLine(),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of(editorAttributes(document.path, input.descriptionId)),
            EditorView.updateListener.of((update) => {
              if (restoring || destroyed) return;
              if (update.docChanged) {
                const content = update.state.doc.toString();
                recordLocalRevision(currentPath, input.onChange(content));
              }
              if (update.selectionSet) {
                const { anchor, head } = update.state.selection.main;
                input.onCursorChange({ anchor, head });
              }
            }),
          ],
        });
      };

      const view = new EditorView({
        parent: input.parent,
        state: createState(initialDocument(input), input.cursor),
      });
      configureEditorFocusTarget(view);

      return {
        setDocument(next) {
          if (destroyed) return;
          if (!shouldApplyControlledDocument(next)) return;
          const contentMatches = next.content === view.state.doc.toString();
          if (next.path === currentPath && next.language === currentLanguage && contentMatches) {
            return;
          }

          restoring = true;
          try {
            documents.save(currentPath, currentLanguage, view.state);
            const nextState = documents.restore(next, () => createState(next));
            currentPath = next.path;
            currentLanguage = next.language;
            view.setState(nextState);
            configureEditorFocusTarget(view);
          } finally {
            restoring = false;
          }
        },
        setSelection(cursor) {
          if (destroyed || !cursor) return;
          const documentLength = view.state.doc.length;
          const anchor = clampOffset(cursor.anchor, documentLength);
          const head = clampOffset(cursor.head, documentLength);
          const currentSelection = view.state.selection.main;
          if (currentSelection.anchor === anchor && currentSelection.head === head) return;
          restoring = true;
          try {
            view.dispatch({
              selection: { anchor, head },
            });
          } finally {
            restoring = false;
          }
        },
        focus() {
          if (!destroyed) view.focus();
        },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          view.destroy();
          documents.clear();
          pendingLocalRevisionsByPath.clear();
        },
      };
    },
  };
}
