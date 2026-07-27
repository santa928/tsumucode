/** File別EditorStateと外部Draft同期がHistoryを混在させないことを検証する。 */
import { history, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import { EditorDocumentStateStore } from './EditorDocumentStateStore';

describe('EditorDocumentStateStore', () => {
  it('FileごとのStateを混在させず、同じ内容の復元でHistoryを維持する', () => {
    const store = new EditorDocumentStateStore();
    const htmlState = EditorState.create({ doc: '<main></main>', extensions: history() });
    const cssState = EditorState.create({ doc: 'main {}', extensions: history() });
    store.save('index.html', 'html', htmlState);
    store.save('styles.css', 'css', cssState);
    const create = vi.fn(() => EditorState.create());

    expect(
      store.restore({ path: 'index.html', language: 'html', content: '<main></main>' }, create),
    ).toBe(htmlState);
    expect(store.restore({ path: 'styles.css', language: 'css', content: 'main {}' }, create)).toBe(
      cssState,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('外部Draft同期をUndo Historyへ追加しない', () => {
    const store = new EditorDocumentStateStore();
    const original = EditorState.create({ doc: '<main></main>', extensions: history() });
    store.save('index.html', 'html', original);

    const restored = store.restore(
      { path: 'index.html', language: 'html', content: '<main>外部更新</main>' },
      () => EditorState.create(),
    );
    expect(restored.doc.toString()).toBe('<main>外部更新</main>');
    expect(undoDepth(restored)).toBe(0);
  });
});
