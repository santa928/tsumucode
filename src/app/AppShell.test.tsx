import { act, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/renderWithRouter';
import { AppShell } from './AppShell';

const runtime = vi.hoisted(() => {
  let snapshot: readonly {
    readonly id: string;
    readonly kind: 'migration' | 'error';
    readonly message: string;
  }[] = [];
  const listeners = new Set<() => void>();
  let health = {
    kind: 'healthy' as 'initializing' | 'healthy' | 'memory-only' | 'retrying' | 'conflict',
    hasUnsavedChanges: false,
    cause: undefined as 'open' | 'read' | 'quota' | 'write' | 'transaction' | undefined,
  };
  const healthListeners = new Set<() => void>();
  const publish = (next: typeof snapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    notices: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      dismiss: vi.fn((id: string) => {
        publish(snapshot.filter((notice) => notice.id !== id));
      }),
      reset: () => {
        publish([]);
      },
      publish,
    },
    progressService: {
      getHealthSnapshot: () => health,
      subscribeHealth: (listener: () => void) => {
        healthListeners.add(listener);
        return () => healthListeners.delete(listener);
      },
    },
    retryPersistence: vi.fn(async () => ({ kind: 'recovered' as const })),
    resolvePersistenceConflict: vi.fn(async () => undefined),
    transferService: { exportAll: vi.fn(async () => '{}') },
    publishHealth: (next: typeof health) => {
      health = next;
      for (const listener of healthListeners) listener();
    },
    resetHealth: () => {
      health = { kind: 'healthy', hasUnsavedChanges: false, cause: undefined };
    },
  };
});

vi.mock('../features/learning/runtimeServices', () => ({
  learningRuntimeServices: {
    notices: runtime.notices,
    progressService: runtime.progressService,
    retryPersistence: runtime.retryPersistence,
    resolvePersistenceConflict: runtime.resolvePersistenceConflict,
    transferService: runtime.transferService,
  },
}));

beforeEach(() => {
  runtime.notices.dismiss.mockClear();
  runtime.notices.reset();
  runtime.resetHealth();
});

describe('AppShell', () => {
  it('Landmark、Main、Navigation、非提携表記を表示する', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<h1>教材カタログ</h1>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveClass('min-h-dvh');
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'TsumuCodeは個人・身内向けに制作した非商用の独立学習サイトです。Progateとは提携・関連していません。教材・課題・UIは独自制作です。',
    );
  });

  it('Skip LinkでMainへfocusし、Hash RouterのURLを壊さない', async () => {
    const originalHash = window.location.hash;
    const { user } = renderWithRouter(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<h1>教材カタログ</h1>} />
        </Route>
      </Routes>,
    );

    const skipLink = screen.getByRole('link', { name: '本文へ移動' });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    await user.tab();
    expect(skipLink).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
    expect(window.location.hash).toBe(originalHash);
  });

  it('routeを越えて残る端末NoticeをAppShellで通知し、明示的に閉じられる', async () => {
    const { user } = renderWithRouter(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<h1>教材カタログ</h1>} />
        </Route>
      </Routes>,
    );

    act(() => {
      runtime.notices.publish([
        {
          id: 'migration:notice-1',
          kind: 'migration',
          message: '教材の更新に合わせて、一部の進捗を安全に初期化しました。',
        },
      ]);
    });
    const noticeRegion = screen.getByRole('region', {
      name: '端末の学習データに関するお知らせ',
    });
    expect(noticeRegion).toHaveTextContent('教材の更新に合わせて');
    expect(screen.getByRole('status')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'このお知らせを閉じる' }));
    expect(runtime.notices.dismiss).toHaveBeenCalledWith('migration:notice-1');
    expect(
      screen.queryByRole('region', { name: '端末の学習データに関するお知らせ' }),
    ).not.toBeInTheDocument();
  });

  it('保存障害は閉じられない常設alertとしてRuntime Noticeと分離して表示する', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<h1>教材カタログ</h1>} />
        </Route>
      </Routes>,
    );

    act(() => {
      runtime.publishHealth({ kind: 'memory-only', cause: 'quota', hasUnsavedChanges: true });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('保存容量');
    expect(screen.queryByRole('button', { name: /閉じる/u })).not.toBeInTheDocument();
  });
});
