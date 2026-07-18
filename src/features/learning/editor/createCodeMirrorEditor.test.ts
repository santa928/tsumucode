import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { EditorLanguageRegistry } from './EditorLanguageRegistry';
import {
  createCodeMirrorEditor,
  createHtmlCssEditorLanguageRegistry,
} from './createCodeMirrorEditor';

/** mount済みCodeMirrorのviewを公開DOMからtest用に取得する。 */
function findView(parent: HTMLElement): EditorView {
  const editor = parent.querySelector<HTMLElement>('.cm-editor');
  const view = editor ? EditorView.findFromDOM(editor) : null;
  if (!view) throw new Error('CodeMirror viewが見つかりません');
  return view;
}

describe('EditorLanguageRegistry', () => {
  it('open stringのlanguageを登録し、重複を拒否して未知languageを安全に解決する', () => {
    const registry = new EditorLanguageRegistry();
    const extension = EditorView.lineWrapping;
    registry.register('future-language', () => extension);

    expect(registry.extensionFor('future-language')).toBe(extension);
    expect(registry.extensionFor('unknown')).toEqual([]);
    expect(() => {
      registry.register('future-language', () => []);
    }).toThrow('Editor language already registered: future-language');
  });

  it('初回Course向けのhtml・css・textを解決する', () => {
    const registry = createHtmlCssEditorLanguageRegistry();
    expect(registry.extensionFor('html')).toBeDefined();
    expect(registry.extensionFor('css')).toBeDefined();
    expect(registry.extensionFor('text')).toEqual([]);
  });
});

describe('createCodeMirrorEditor', () => {
  it('利用者編集とcursorだけを通知し、復元操作はcallbackを発火しない', () => {
    const parent = document.createElement('div');
    const onChange = vi.fn();
    const onCursorChange = vi.fn();
    const handle = createCodeMirrorEditor().mount({
      parent,
      path: 'index.html',
      language: 'html',
      content: '<main />',
      cursor: { anchor: 999, head: -10 },
      diagnostics: [],
      onChange,
      onCursorChange,
    });
    const view = findView(parent);
    expect(view.state.selection.main).toMatchObject({ anchor: 8, head: 0 });

    view.dispatch({ changes: { from: view.state.doc.length, insert: '!' } });
    expect(onChange).toHaveBeenLastCalledWith('<main />!');

    view.dispatch({ selection: { anchor: 1, head: 3 } });
    expect(onCursorChange).toHaveBeenLastCalledWith({ anchor: 1, head: 3 });
    onChange.mockClear();
    onCursorChange.mockClear();

    handle.setDocument({
      path: 'style.css',
      language: 'css',
      content: 'main{}',
      diagnostics: [],
    });
    handle.setSelection({ anchor: 999, head: -10 });

    expect(view.contentDOM).toHaveAttribute('aria-label', 'style.css のコードエディター');
    expect(view.state.doc.toString()).toBe('main{}');
    expect(view.state.selection.main).toMatchObject({ anchor: 6, head: 0 });
    expect(onChange).not.toHaveBeenCalled();
    expect(onCursorChange).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('同じcontentでもpathまたはlanguage変更を反映し、破棄は冪等に扱う', () => {
    const parent = document.createElement('div');
    const registry = new EditorLanguageRegistry();
    const htmlFactory = vi.fn(() => []);
    const cssFactory = vi.fn(() => []);
    registry.register('html', htmlFactory);
    registry.register('css', cssFactory);
    const handle = createCodeMirrorEditor(registry).mount({
      parent,
      path: 'index.html',
      language: 'html',
      content: 'same',
      diagnostics: [],
      onChange: vi.fn(),
      onCursorChange: vi.fn(),
    });

    handle.setDocument({
      path: 'partial.html',
      language: 'html',
      content: 'same',
      diagnostics: [],
    });
    expect(findView(parent).contentDOM).toHaveAttribute(
      'aria-label',
      'partial.html のコードエディター',
    );
    expect(cssFactory).not.toHaveBeenCalled();

    handle.setDocument({
      path: 'partial.html',
      language: 'css',
      content: 'same',
      diagnostics: [],
    });
    expect(findView(parent).contentDOM).toHaveAttribute(
      'aria-label',
      'partial.html のコードエディター',
    );
    expect(cssFactory).toHaveBeenCalled();

    handle.destroy();
    expect(() => {
      handle.destroy();
    }).not.toThrow();
    expect(() => {
      handle.focus();
    }).not.toThrow();
    expect(() => {
      handle.setSelection({ anchor: 0, head: 0 });
    }).not.toThrow();
  });
});
