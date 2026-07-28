import { act, screen, within } from '@testing-library/react';
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
  it('Slide routeでは学習ShellをDocument高へ収める印を付ける', async () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/courses/:courseId/lessons/:lessonId/slides/:slideId"
            element={<h1>HTMLの仕組み</h1>}
          />
        </Route>
      </Routes>,
      { route: '/courses/html-css/lessons/lesson-first/slides/slide-html-role' },
    );

    expect(await screen.findByRole('heading', { name: 'HTMLの仕組み' })).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-learning-route', 'true');
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('Exercise詳細routeも固定学習Shellの対象にする', async () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/courses/:courseId/lessons/:lessonId/exercises/:exerciseId"
            element={<h1>見出しを変更する</h1>}
          />
        </Route>
      </Routes>,
      { route: '/courses/html-css/lessons/lesson-first/exercises/exercise-heading' },
    );

    expect(await screen.findByRole('heading', { name: '見出しを変更する' })).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-learning-route', 'true');
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('通常routeではHeader、Main、Navigationを表示し、Footerを置かない', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<h1>教材カタログ</h1>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument();
    const brandLink = screen.getByRole('link', { name: 'TsumuCodeホームへ（ベータ版）' });
    expect(brandLink).toHaveAttribute('href', '/');
    expect(within(brandLink).getByRole('img', { name: 'ベータ版' })).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveClass('min-h-dvh');
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-learning-route', 'false');
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
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
    expect(within(noticeRegion).getByRole('status')).toBeInTheDocument();

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
