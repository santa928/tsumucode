import { typescriptLanguage } from '@codemirror/lang-javascript';
import { language } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { expect, it, vi } from 'vitest';
import { EditorLanguageRegistry } from './EditorLanguageRegistry';
import { registerTypeScriptEditorLanguage } from './typescriptEditorLanguage';

it('TypeScript parserを登録し、二度目も同じ拡張を保持する', async () => {
  const registry = new EditorLanguageRegistry();
  const register = vi.spyOn(registry, 'register');
  await registerTypeScriptEditorLanguage(registry);
  const extension = registry.extensionFor('typescript');
  const state = EditorState.create({
    doc: 'interface Score { value: number; }',
    extensions: [extension],
  });
  expect(state.facet(language)).toBe(typescriptLanguage);
  await registerTypeScriptEditorLanguage(registry);
  expect(register).toHaveBeenCalledOnce();
});
