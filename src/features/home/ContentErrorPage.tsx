import { Link, useRevalidator, useRouteError } from 'react-router-dom';
import { ContentLoadError } from '../../core/content/loadCourseCatalog';

/** 教材取得失敗を内部詳細へ露出せず、再試行とHome復帰へ変換する。 */
export function ContentErrorPage() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const isLoading = revalidator.state !== 'idle';
  const message =
    error instanceof ContentLoadError
      ? error.message
      : '教材を表示できませんでした。URLを確認して、教材一覧からもう一度お試しください。';

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="tc-content-frame mx-auto min-h-dvh w-full max-w-3xl bg-workshop-canvas py-12 text-workshop-ink md:py-20"
    >
      <div role="alert">
        <p className="font-bold text-workshop-correction">作業台で問題が起きました</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">教材を読み込めませんでした</h1>
        <p className="mt-4 max-w-2xl text-workshop-muted">{message}</p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => {
            void revalidator.revalidate();
          }}
          disabled={isLoading}
          className="inline-flex min-h-11 items-center justify-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary transition-colors duration-[var(--tc-motion-fast)] hover:bg-[var(--tc-color-primary-hover)] disabled:cursor-wait disabled:opacity-70"
        >
          {isLoading ? '読み込み中' : 'もう一度読み込む'}
        </button>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-workshop-sm px-3 py-2 font-bold underline decoration-2 underline-offset-4"
        >
          教材一覧へ戻る
        </Link>
      </div>
      <p role="status" aria-live="polite" className="mt-4 text-sm text-workshop-muted">
        {isLoading ? '教材を再読み込みしています。' : ''}
      </p>
    </main>
  );
}
