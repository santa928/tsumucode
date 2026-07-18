/** CodeMirrorの状態とDOM副作用をEditorAdapter内部へ閉じ込める。 */
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import type { EditorCursor } from '../../../core/persistence/contracts';
import type { EditorAdapter } from './EditorAdapter';
import { EditorLanguageRegistry } from './EditorLanguageRegistry';

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

/** 初回HTML/CSS Courseが使う言語を、将来拡張可能なRegistryとして生成する。 */
export function createHtmlCssEditorLanguageRegistry(): EditorLanguageRegistry {
  const registry = new EditorLanguageRegistry();
  registerHtmlCssEditorLanguages(registry);
  return registry;
}

/** CodeMirror lazy chunk評価後にだけHTML/CSS既定言語を共有Registryへ補う。 */
export function registerHtmlCssEditorLanguages(registry: EditorLanguageRegistry): void {
  if (!registry.has('html')) registry.register('html', html);
  if (!registry.has('css')) registry.register('css', css);
  if (!registry.has('text')) registry.register('text', () => []);
}

/** CodeMirrorのimperative APIをUI・Repository非依存のEditorAdapterへ変換する。 */
export function createCodeMirrorEditor(
  registry = createHtmlCssEditorLanguageRegistry(),
): EditorAdapter {
  return {
    mount(input) {
      let currentPath = input.path;
      let currentLanguage = input.language;
      let restoring = false;
      let destroyed = false;
      const languageCompartment = new Compartment();
      const attributesCompartment = new Compartment();
      const initialSelection = selectionFor(input.cursor, input.content.length);
      const view = new EditorView({
        parent: input.parent,
        state: EditorState.create({
          doc: input.content,
          ...(initialSelection ? { selection: initialSelection } : {}),
          extensions: [
            languageCompartment.of(registry.extensionFor(input.language)),
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightActiveLine(),
            keymap.of([]),
            EditorView.lineWrapping,
            attributesCompartment.of(
              EditorView.contentAttributes.of({
                'aria-label': `${input.path} のコードエディター`,
                spellcheck: 'false',
              }),
            ),
            EditorView.updateListener.of((update) => {
              if (restoring || destroyed) return;
              if (update.docChanged) input.onChange(update.state.doc.toString());
              if (update.selectionSet) {
                const { anchor, head } = update.state.selection.main;
                input.onCursorChange({ anchor, head });
              }
            }),
          ],
        }),
      });

      return {
        setDocument(next) {
          if (destroyed) return;
          const contentMatches = next.content === view.state.doc.toString();
          if (next.path === currentPath && next.language === currentLanguage && contentMatches) {
            return;
          }

          restoring = true;
          try {
            currentPath = next.path;
            currentLanguage = next.language;
            view.dispatch({
              ...(contentMatches
                ? {}
                : {
                    changes: {
                      from: 0,
                      to: view.state.doc.length,
                      insert: next.content,
                    },
                  }),
              effects: [
                languageCompartment.reconfigure(registry.extensionFor(next.language)),
                attributesCompartment.reconfigure(
                  EditorView.contentAttributes.of({
                    'aria-label': `${next.path} のコードエディター`,
                    spellcheck: 'false',
                  }),
                ),
              ],
            });
          } finally {
            restoring = false;
          }
        },
        setSelection(cursor) {
          if (destroyed || !cursor) return;
          restoring = true;
          try {
            const documentLength = view.state.doc.length;
            view.dispatch({
              selection: {
                anchor: clampOffset(cursor.anchor, documentLength),
                head: clampOffset(cursor.head, documentLength),
              },
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
        },
      };
    },
  };
}
