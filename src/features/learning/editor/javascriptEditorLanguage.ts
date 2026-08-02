/** JavaScript Course向けCodeMirror Language Profileを登録する。 */
import { javascript } from '@codemirror/lang-javascript';
import type { EditorLanguageRegistry } from './EditorLanguageRegistry';

/** 素のJavaScriptだけを有効にし、既存Profileを上書きせず冪等に登録する。 */
export async function registerJavaScriptEditorLanguage(
  registry: EditorLanguageRegistry,
): Promise<void> {
  if (registry.has('javascript')) return;
  registry.register('javascript', () => javascript({ jsx: false, typescript: false }));
}
