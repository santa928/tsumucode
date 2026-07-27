/** HTML/CSS Course向けLanguage Profileを既存Registryへ登録する。 */
import { css } from '@codemirror/lang-css';
import { autoCloseTags, html } from '@codemirror/lang-html';
import { EditorLanguageRegistry } from './EditorLanguageRegistry';

/** HTML/CSS/Text Profileを外部登録を上書きせずに補う。 */
export function registerHtmlCssEditorLanguages(registry: EditorLanguageRegistry): void {
  if (!registry.has('html')) registry.register('html', () => [html(), autoCloseTags]);
  if (!registry.has('css')) registry.register('css', css);
  if (!registry.has('text')) registry.register('text', () => []);
}

/** 初回HTML/CSS Course向けの登録済みRegistryを生成する。 */
export function createHtmlCssEditorLanguageRegistry(): EditorLanguageRegistry {
  const registry = new EditorLanguageRegistry();
  registerHtmlCssEditorLanguages(registry);
  return registry;
}
