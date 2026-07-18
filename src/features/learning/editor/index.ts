/** Learning UIが利用するeditor公開APIを1箇所から提供する。 */
export { CodeWorkspace } from './CodeWorkspace';
export type { CodeWorkspaceProps } from './CodeWorkspace';
export type { EditorAdapter, EditorHandle, EditorMountInput } from './EditorAdapter';
export { EditorLanguageRegistry } from './EditorLanguageRegistry';
export {
  createCodeMirrorEditor,
  createHtmlCssEditorLanguageRegistry,
  registerHtmlCssEditorLanguages,
} from './createCodeMirrorEditor';
