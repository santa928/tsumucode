/** JavaScript Profileと共通Editor体験の組み合わせを検証する。 */
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { indentUnit, language } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { createEditorExperienceExtensions } from './createEditorExperienceExtensions';
import { EditorLanguageRegistry } from './EditorLanguageRegistry';
import { registerJavaScriptEditorLanguage } from './javascriptEditorLanguage';

describe('JavaScript Editor Language Profile', () => {
  it('JavaScript parserと共通の2 Space入力支援を登録する', async () => {
    const registry = new EditorLanguageRegistry();

    await registerJavaScriptEditorLanguage(registry);
    const state = EditorState.create({
      doc: "document.querySelector('#message').textContent = 'こんにちは';",
      extensions: [...createEditorExperienceExtensions(), registry.extensionFor('javascript')],
    });

    expect(registry.has('javascript')).toBe(true);
    expect(state.facet(language)).toBe(javascriptLanguage);
    expect(state.facet(indentUnit)).toBe('  ');
    expect(state.languageDataAt<readonly string[]>('closeBrackets', 0)).not.toEqual([]);
  });

  it('既存JavaScript Profileを上書きしない', async () => {
    const registry = new EditorLanguageRegistry();
    const existing: Extension = [];
    registry.register('javascript', () => existing);

    await expect(registerJavaScriptEditorLanguage(registry)).resolves.toBeUndefined();
    expect(registry.extensionFor('javascript')).toBe(existing);
  });
});
