/** HTML/CSS/Text Profileと未知LanguageのFail-open契約を検証する。 */
import { htmlLanguage } from '@codemirror/lang-html';
import { language } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import { EditorLanguageRegistry } from './EditorLanguageRegistry';
import { createHtmlCssEditorLanguageRegistry } from './htmlCssEditorLanguages';

describe('HTML/CSS Editor Language Profile', () => {
  it('HTMLとCSSを登録し、Textと未知Languageは空Extensionへ解決する', () => {
    const registry = createHtmlCssEditorLanguageRegistry();

    expect(registry.has('html')).toBe(true);
    expect(registry.has('css')).toBe(true);
    expect(registry.has('text')).toBe(true);
    expect(registry.extensionFor('text')).toEqual([]);
    expect(registry.extensionFor('unknown')).toEqual([]);
  });

  it('HTML ProfileはHTML Parserと閉じTag入力支援を同じProfileに含める', () => {
    const registry = createHtmlCssEditorLanguageRegistry();
    const state = EditorState.create({ extensions: registry.extensionFor('html') });

    expect(state.facet(language)).toBe(htmlLanguage);
  });

  it('登録Factoryが失敗してもPlain TextへFallbackする', () => {
    const registry = new EditorLanguageRegistry();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registry.register('broken-language', () => {
      throw new Error('broken factory');
    });

    expect(registry.extensionFor('broken-language')).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      'Editor Language Profileを読み込めませんでした: broken-language',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
