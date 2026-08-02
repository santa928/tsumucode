import type { MouseEvent } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { BetaBadge } from '../../design-system/components/BetaBadge';

/** Hashを変更せず、Skip Linkから閲覧MainへFocusを移す。 */
function focusMainContent(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  document.getElementById('main-content')?.focus();
}

/** 目次だけにBrandとHome復帰を表示し、Viewerの高さを消費しない。 */
function LibraryCatalogHeader() {
  return (
    <header className="tc-site-header border-b border-workshop-border bg-workshop-surface">
      <div className="tc-content-frame mx-auto flex min-h-14 w-full max-w-[var(--tc-content-max)] items-center justify-between">
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
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-workshop-sm px-3 py-2 font-bold hover:bg-workshop-workbench"
        >
          教材を選ぶ
        </Link>
      </div>
    </header>
  );
}

/** 目次とViewerだけを進捗Runtimeから分離して収容する閲覧専用Shell。 */
export function LibraryShell() {
  const location = useLocation();
  const viewer = /^\/library\/[^/]+\/lessons\/[^/]+\/slides\/[^/]+\/?$/u.test(location.pathname);

  return (
    <div
      className="tc-app-shell tc-library-shell flex min-h-dvh flex-col bg-workshop-canvas text-workshop-ink"
      data-learning-route={String(viewer)}
      data-library-viewer={String(viewer)}
      data-testid="library-shell"
    >
      <a href="#main-content" onClick={focusMainContent} className="tc-skip-link">
        本文へ移動
      </a>
      {viewer ? null : <LibraryCatalogHeader />}
      <main
        id="main-content"
        tabIndex={-1}
        className={
          viewer
            ? 'tc-content-frame tc-learning-main mx-auto w-full max-w-[var(--tc-content-max)] flex-1'
            : 'tc-content-frame tc-library-index-main mx-auto w-full max-w-[var(--tc-content-max)] flex-1 py-6 md:py-8'
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
