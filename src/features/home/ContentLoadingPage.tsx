/** 初回Catalog取得中も空白にせず、現在の処理を支援技術へ通知する。 */
export function ContentLoadingPage() {
  return (
    <section aria-labelledby="content-loading-title" aria-busy="true" className="max-w-2xl py-8">
      <div aria-hidden="true" className="flex h-10 w-40 items-end gap-2">
        <span className="h-6 flex-1 rounded-workshop-piece bg-workshop-learning" />
        <span className="h-10 flex-1 rounded-workshop-piece bg-workshop-complete" />
        <span className="h-8 flex-1 rounded-workshop-piece bg-workshop-wood" />
      </div>
      <h1 id="content-loading-title" className="mt-5 text-3xl font-black">
        教材のピースを並べています
      </h1>
      <p role="status" aria-live="polite" className="mt-3 text-workshop-muted">
        学習工房を準備しています。少しだけお待ちください。
      </p>
    </section>
  );
}
