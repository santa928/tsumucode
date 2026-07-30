import { useSyncExternalStore, type MouseEvent } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BetaBadge } from '../design-system/components/BetaBadge';
import { learningRuntimeServices } from '../features/learning/runtimeServices';
import { PersistenceHealthBanner } from '../features/progress/PersistenceHealthBanner';

const PERSISTENCE_NOTICE_IDS = new Set([
  'error:exercise-save',
  'error:exercise-initialize',
  'error:slide-progress',
  'error:learning-progress',
]);

/** Hash routeを変更せず、Keyboard focusを本文Landmarkへ移す。 */
function focusMainContent(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  document.getElementById('main-content')?.focus();
}

/** Slide／Exerciseの詳細Routeだけを固定学習Viewport対象として判定する。 */
function isLearningDetailRoute(pathname: string): boolean {
  return /^\/courses\/[^/]+\/lessons\/[^/]+\/(?:slides|exercises)\/[^/]+\/?$/u.test(pathname);
}

/** 通常RouteのNavigationと全Route共通の本文・safe-area・Runtime Noticeを提供する。 */
export function AppShell() {
  const location = useLocation();
  const learningRoute = isLearningDetailRoute(location.pathname);
  const notices = useSyncExternalStore(
    learningRuntimeServices.notices.subscribe,
    learningRuntimeServices.notices.getSnapshot,
    learningRuntimeServices.notices.getSnapshot,
  );
  const persistenceHealth = useSyncExternalStore(
    learningRuntimeServices.progressService.subscribeHealth,
    learningRuntimeServices.progressService.getHealthSnapshot,
    learningRuntimeServices.progressService.getHealthSnapshot,
  );
  const persistenceDegraded =
    persistenceHealth.kind !== 'initializing' && persistenceHealth.kind !== 'healthy';
  const visibleNotices =
    learningRoute && persistenceDegraded
      ? notices.filter(({ id }) => !PERSISTENCE_NOTICE_IDS.has(id))
      : notices;

  return (
    <div
      className="tc-app-shell flex min-h-dvh flex-col bg-workshop-canvas text-workshop-ink"
      data-learning-route={String(learningRoute)}
      data-testid="app-shell"
    >
      <a
        href="#main-content"
        onClick={focusMainContent}
        className="tc-skip-link inline-flex min-h-11 items-center rounded-workshop-sm bg-workshop-primary px-4 py-2 font-bold text-workshop-on-primary shadow-[var(--tc-shadow-piece)]"
      >
        本文へ移動
      </a>
      {!learningRoute ? (
        <header className="tc-site-header border-b border-workshop-border bg-workshop-surface">
          <div className="tc-content-frame mx-auto flex w-full max-w-[var(--tc-content-max)] flex-wrap items-center justify-between gap-4 py-4">
            <Link
              to="/"
              aria-label="TsumuCodeホームへ（ベータ版）"
              className="inline-flex min-h-11 items-center gap-3 font-black"
            >
              <span aria-hidden="true" className="grid grid-cols-2 gap-0.5">
                <span className="size-2.5 rounded-workshop-piece bg-workshop-learning" />
                <span className="size-2.5 rounded-workshop-piece bg-workshop-complete" />
                <span className="col-span-2 h-2.5 rounded-workshop-piece bg-workshop-primary" />
              </span>
              <span className="inline-flex items-center gap-2 text-xl">
                TsumuCode
                <BetaBadge />
              </span>
            </Link>
            <nav aria-label="メインナビゲーション">
              <Link
                to="/"
                className="inline-flex min-h-11 items-center rounded-workshop-sm px-3 py-2 font-bold transition-colors duration-[var(--tc-motion-fast)] hover:bg-workshop-workbench"
              >
                教材を選ぶ
              </Link>
            </nav>
          </div>
        </header>
      ) : null}
      <PersistenceHealthBanner />
      {visibleNotices.length > 0 ? (
        <section
          aria-label="端末の学習データに関するお知らせ"
          className="tc-content-frame mx-auto mt-4 w-full max-w-[var(--tc-content-max)] space-y-2"
        >
          {visibleNotices.map((notice) => (
            <div
              key={notice.id}
              role={notice.kind === 'error' ? 'alert' : 'status'}
              className="flex flex-wrap items-center justify-between gap-3 rounded-workshop-md border-2 border-workshop-correction bg-workshop-raised p-4"
            >
              <p className="font-bold">{notice.message}</p>
              <button
                type="button"
                onClick={() => {
                  learningRuntimeServices.notices.dismiss(notice.id);
                }}
                className="inline-flex min-h-11 items-center rounded-workshop-sm border border-workshop-border px-3 py-2 font-bold"
              >
                このお知らせを閉じる
              </button>
            </div>
          ))}
        </section>
      ) : null}
      <main
        id="main-content"
        tabIndex={-1}
        className={`tc-content-frame mx-auto w-full max-w-[var(--tc-content-max)] flex-1 ${
          learningRoute ? 'tc-learning-main' : 'min-h-dvh py-8 md:py-10'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
