/** 言語非依存のCodeMirror入力支援を、明示的な最小Extension集合へまとめる。 */
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { workshopHighlightStyle } from './workshopHighlightStyle';

/** 全言語へHighlight、2 Space Indent、括弧補完、History、Keymapを提供する。 */
export function createEditorExperienceExtensions(): readonly Extension[] {
  return [
    syntaxHighlighting(workshopHighlightStyle),
    indentUnit.of('  '),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    history(),
    keymap.of([indentWithTab, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
  ];
}
