import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { EditorLanguageRegistry } from './EditorLanguageRegistry';
import { createCodeMirrorEditor } from './createCodeMirrorEditor';
import { createHtmlCssEditorLanguageRegistry } from './htmlCssEditorLanguages';

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
    document.body.append(parent);
    let revision = 0;
    const onChange = vi.fn<(content: string) => number>(() => {
      revision += 1;
      return revision;
    });
    const onCursorChange = vi.fn();
    const handle = createCodeMirrorEditor().mount({
      parent,
      path: 'index.html',
      language: 'html',
      content: '<main />',
      contentRevision: 0,
      descriptionId: 'editor-help',
      cursor: { anchor: 999, head: -10 },
      diagnostics: [],
      onChange,
      onCursorChange,
    });
    const view = findView(parent);
    expect(view.state.selection.main).toMatchObject({ anchor: 8, head: 0 });
    expect(view.contentDOM).toHaveAttribute('aria-describedby', 'editor-help');
    expect(view.scrollDOM).not.toHaveAttribute('tabindex');
    expect(view.contentDOM).toHaveAttribute('tabindex', '0');
    handle.focus();
    expect(view.hasFocus).toBe(true);

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
      contentRevision: 1,
      diagnostics: [],
    });
    handle.setSelection({ anchor: 999, head: -10 });

    expect(view.contentDOM).toHaveAttribute('aria-label', 'style.css のコードエディター');
    expect(view.scrollDOM).not.toHaveAttribute('tabindex');
    expect(view.contentDOM).toHaveAttribute('tabindex', '0');
    expect(view.state.doc.toString()).toBe('main{}');
    expect(view.state.selection.main).toMatchObject({ anchor: 6, head: 0 });
    expect(onChange).not.toHaveBeenCalled();
    expect(onCursorChange).not.toHaveBeenCalled();
    handle.destroy();
    parent.remove();
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
      contentRevision: 0,
      diagnostics: [],
      onChange: vi.fn(),
      onCursorChange: vi.fn(),
    });

    handle.setDocument({
      path: 'partial.html',
      language: 'html',
      content: 'same',
      contentRevision: 0,
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
      contentRevision: 0,
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

  it('別FileのUndoが現在Fileだけに作用し、元FileのHistoryを維持する', () => {
    const parent = document.createElement('div');
    let revision = 0;
    const handle = createCodeMirrorEditor().mount({
      parent,
      path: 'index.html',
      language: 'html',
      content: '<main></main>',
      contentRevision: 0,
      diagnostics: [],
      onChange: vi.fn(() => {
        revision += 1;
        return revision;
      }),
      onCursorChange: vi.fn(),
    });
    let view = findView(parent);
    view.dispatch({ changes: { from: 6, insert: '<h1>HTML変更</h1>' } });
    const editedHtml = view.state.doc.toString();

    handle.setDocument({
      path: 'styles.css',
      language: 'css',
      content: 'main {}',
      contentRevision: 1,
      diagnostics: [],
    });
    view = findView(parent);
    view.dispatch({ changes: { from: 6, insert: 'color: red;' } });
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).not.toContain('color: red;');

    handle.setDocument({
      path: 'index.html',
      language: 'html',
      content: editedHtml,
      contentRevision: 2,
      diagnostics: [],
    });
    view = findView(parent);
    expect(view.state.doc.toString()).toContain('HTML変更');
    handle.setSelection({ anchor: 0, head: 0 });
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).not.toContain('HTML変更');
    handle.destroy();
  });

  it('revision付きechoは巻き戻さず、同じ値の新revisionとlanguage変更を外部更新として受理する', () => {
    const parent = document.createElement('div');
    let revision = 0;
    const onChange = vi.fn<(content: string) => number>(() => {
      revision += 1;
      return revision;
    });
    const handle = createCodeMirrorEditor().mount({
      parent,
      path: 'index.html',
      language: 'html',
      content: '',
      contentRevision: 0,
      diagnostics: [],
      onChange,
      onCursorChange: vi.fn(),
    });
    const view = findView(parent);
    view.dispatch({ changes: { from: 0, insert: 'a' } });
    view.dispatch({ changes: { from: 1, insert: 'b' } });
    expect(onChange.mock.calls.map(([content]) => content)).toEqual(['a', 'ab']);

    handle.setDocument({
      path: 'index.html',
      language: 'html',
      content: 'a',
      contentRevision: 1,
      diagnostics: [],
    });
    expect(view.state.doc.toString()).toBe('ab');
    handle.setDocument({
      path: 'index.html',
      language: 'html',
      content: 'ab',
      contentRevision: 2,
      diagnostics: [],
    });
    expect(view.state.doc.toString()).toBe('ab');
    handle.setDocument({
      path: 'index.html',
      language: 'html',
      content: 'a',
      contentRevision: 1,
      diagnostics: [],
    });
    expect(view.state.doc.toString()).toBe('ab');

    handle.setDocument({
      path: 'index.html',
      language: 'html',
      content: 'a',
      contentRevision: 3,
      diagnostics: [],
    });
    expect(view.state.doc.toString()).toBe('a');

    handle.setDocument({
      path: 'index.html',
      language: 'css',
      content: 'a',
      contentRevision: 4,
      diagnostics: [],
    });
    expect(view.state.doc.toString()).toBe('a');
    handle.destroy();
  });

  it('親が受理しなかった編集を同一revisionのcontrolled値へ戻す', () => {
    const parent = document.createElement('div');
    const handle = createCodeMirrorEditor().mount({
      parent,
      path: 'index.html',
      language: 'html',
      content: '正本',
      contentRevision: 7,
      diagnostics: [],
      onChange: () => undefined,
      onCursorChange: vi.fn(),
    });
    const view = findView(parent);
    view.dispatch({ changes: { from: 2, insert: 'ではない' } });
    expect(view.state.doc.toString()).toBe('正本ではない');

    handle.setDocument({
      path: 'index.html',
      language: 'html',
      content: '正本',
      contentRevision: 7,
      diagnostics: [],
    });

    expect(view.state.doc.toString()).toBe('正本');
    handle.destroy();
  });
});
