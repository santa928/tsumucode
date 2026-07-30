import { describe, expect, it, vi } from 'vitest';
import { RuntimeNoticeStore } from './runtimeNotices';

/** sessionStorage互換の最小memory storeを作る。 */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('RuntimeNoticeStore', () => {
  it('同じCourseのmigration Noticeを1件へ集約してsession内へ保持し、購読とdismissを通知する', () => {
    const storage = memoryStorage();
    const store = new RuntimeNoticeStore({ storage });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.addMigrationNotices([
      { id: 'notice-1', courseId: 'html-css', reason: '旧IDを初期化' },
      { id: 'notice-2', courseId: 'html-css', reason: '別の旧IDを初期化' },
    ]);
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0]).toMatchObject({
      id: 'migration:html-css',
      kind: 'migration',
    });
    expect(store.getSnapshot()[0]?.message).toContain('教材の更新');
    expect(listener).toHaveBeenCalledOnce();

    const restored = new RuntimeNoticeStore({ storage });
    expect(restored.getSnapshot()).toEqual(store.getSnapshot());
    store.dismiss('migration:html-css');
    expect(store.getSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('複数Courseのmigration NoticeはCourseごとに1件ずつ保持する', () => {
    const store = new RuntimeNoticeStore({ storage: memoryStorage() });

    store.addMigrationNotices([
      { id: 'notice-1', courseId: 'html-css', reason: '旧IDを初期化' },
      { id: 'notice-2', courseId: 'html-css', reason: '別の旧IDを初期化' },
      { id: 'notice-3', courseId: 'typescript', reason: '旧IDを初期化' },
    ]);

    expect(store.getSnapshot()).toEqual([
      expect.objectContaining({ id: 'migration:html-css', kind: 'migration' }),
      expect.objectContaining({ id: 'migration:typescript', kind: 'migration' }),
    ]);
  });

  it('同じ領域のErrorを重複させず常設警告へ変換し、内部Error文字列を表示しない', () => {
    const store = new RuntimeNoticeStore({ storage: memoryStorage() });

    store.reportError('slide-progress', new Error('secret database path'));
    store.reportError('slide-progress', new Error('another secret'));

    expect(store.getSnapshot()).toEqual([
      expect.objectContaining({
        id: 'error:slide-progress',
        kind: 'error',
        message: '端末への進捗保存に失敗しました。もう一度操作してください。',
      }),
    ]);
    expect(JSON.stringify(store.getSnapshot())).not.toContain('secret');
  });

  it('preview失敗を保存失敗と区別した安全な再操作文言へ変換する', () => {
    const store = new RuntimeNoticeStore({ storage: memoryStorage() });

    store.reportError('exercise-preview', new Error('internal frame detail'));

    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0]).toMatchObject({ id: 'error:exercise-preview' });
    expect(store.getSnapshot()[0]?.message).toContain('手動の更新をもう一度');
    expect(JSON.stringify(store.getSnapshot())).not.toContain('internal frame detail');
  });

  it('保存healthがdegradedなら重複する保存Errorだけを抑止し、Preview失敗は保持する', () => {
    let persistenceDegraded = true;
    const store = new RuntimeNoticeStore({
      storage: memoryStorage(),
      isPersistenceDegraded: () => persistenceDegraded,
    });

    store.reportError('exercise-save', new Error('quota'));
    store.reportError('exercise-initialize', new Error('read'));
    store.reportError('slide-progress', new Error('write'));
    store.reportError('learning-progress', new Error('transaction'));
    store.reportError('exercise-preview', new Error('frame'));
    expect(store.getSnapshot()).toEqual([
      expect.objectContaining({ id: 'error:exercise-preview', kind: 'error' }),
    ]);

    persistenceDegraded = false;
    store.reportError('slide-progress', new Error('write'));
    expect(store.getSnapshot()).toContainEqual(
      expect.objectContaining({ id: 'error:slide-progress', kind: 'error' }),
    );
  });

  it('壊れた保存値とStorage例外を無視し、memory queueを維持する', () => {
    const broken = {
      getItem: vi.fn(() => '{broken'),
      setItem: vi.fn(() => {
        throw new DOMException('denied', 'SecurityError');
      }),
      removeItem: vi.fn(),
    } as unknown as Storage;
    const store = new RuntimeNoticeStore({ storage: broken });

    expect(() => {
      store.reportError('exercise-initialize', new Error('failed'));
    }).not.toThrow();
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0]).toMatchObject({ id: 'error:exercise-initialize' });
  });

  it('queue上限では最古のmigrationを退避し、後発の保存Errorを必ず保持する', () => {
    const store = new RuntimeNoticeStore({ storage: memoryStorage() });
    store.addMigrationNotices(
      Array.from({ length: 100 }, (_, index) => ({
        id: `notice-${String(index + 1)}`,
        courseId: `course-${String(index + 1)}`,
        reason: '旧IDを初期化',
      })),
    );

    store.reportError('slide-progress', new Error('quota'));

    expect(store.getSnapshot()).toHaveLength(100);
    expect(store.getSnapshot()).toContainEqual(
      expect.objectContaining({ id: 'error:slide-progress', kind: 'error' }),
    );
    expect(store.getSnapshot().some(({ id }) => id === 'migration:course-1')).toBe(false);
  });
});
