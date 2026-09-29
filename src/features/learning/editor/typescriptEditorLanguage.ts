/** TypeScript演習に到達した時だけCodeMirrorの型構文を有効にする。 */
import { javascript } from '@codemirror/lang-javascript';
import type { EditorLanguageRegistry } from './EditorLanguageRegistry';

/** TSXを有効にせず、既存の言語登録を保持してTypeScriptを追加する。 */
export async function registerTypeScriptEditorLanguage(
  registry: EditorLanguageRegistry,
): Promise<void> {
  if (!registry.has('typescript'))
    registry.register('typescript', () => javascript({ jsx: false, typescript: true }));
}
