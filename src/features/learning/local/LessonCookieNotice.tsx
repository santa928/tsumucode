/** 限定Cookieを埋込みで使えない場合だけ、同じrunの別タブへ案内する。 */
export function LessonCookieNotice({
  workspaceId,
  previewUrl,
}: {
  readonly workspaceId: string;
  readonly previewUrl: string;
}) {
  if (!['next-ch04-l01-e01', 'next-ch04-l02-e01'].includes(workspaceId)) return null;
  return (
    <details className="mb-3">
      <summary className="cursor-pointer font-bold">
        Cookieが埋込み画面で保存・読取できない場合
      </summary>
      <p className="mt-2">
        この2教材ではサーバーから lesson-theme=light／dark だけを扱えます。
        ブラウザが埋込みのCookieを制限する場合は、同じ実行を別タブで試してください。
        Cookieは同じ実行中のSource反映では保持され、停止後の新しい実行には引き継がれません。
      </p>
      <a
        className="mt-2 inline-flex min-h-11 items-center font-bold underline"
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Cookie確認用にPreviewを別タブで開く
      </a>
    </details>
  );
}
