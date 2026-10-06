import { javascript } from '@codemirror/lang-javascript';
import type { EditorLanguageRegistry } from './EditorLanguageRegistry';

/** React演習でだけTSXの編集支援を登録する。 */
export async function registerReactEditorLanguage(registry: EditorLanguageRegistry): Promise<void> {
  if (!registry.has('react'))
    registry.register('react', () => javascript({ jsx: true, typescript: true }));
}
