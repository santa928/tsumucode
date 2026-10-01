/** 代表演習のクリック時点のソースを、保存状態へ書き込まず持ち出す副操作。 */
import { useEffect, useId, useRef, useState } from 'react';

interface PortableHtmlExportProps {
  readonly files: Readonly<Record<string, string>>;
  readonly disabled: boolean;
}

/** ライブラリ読み込みを操作時まで遅らせ、画面を離れた後のDownloadを抑止する。 */
export function PortableHtmlExport({ files, disabled }: PortableHtmlExportProps) {
  const descriptionId = useId();
  const mounted = useRef(false);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** 非同期Importの前に2ソースを固定し、編集中の別Revisionを混ぜない。 */
  async function exportSource(): Promise<void> {
    if (disabled || pending.current) return;
    const snapshot = { 'index.html': files['index.html'], 'styles.css': files['styles.css'] };
    pending.current = true;
    setBusy(true);
    setMessage(undefined);
    setFailed(false);
    try {
      const { createPortableHtmlArchive, downloadPortableHtmlArchive } =
        await import('./portableHtmlArchive');
      if (!mounted.current) return;
      downloadPortableHtmlArchive(createPortableHtmlArchive(snapshot));
      setMessage('ZIPを作成しました。保存先はブラウザで確認してください。');
    } catch (error) {
      if (!mounted.current) return;
      setFailed(true);
      setMessage(
        error instanceof Error &&
          (error.message.includes('256 KiB') || error.message.includes('そろっていません'))
          ? error.message
          : 'ZIPを作成できませんでした。編集内容は残っています。もう一度試してください。',
      );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section aria-label="サイトの外で開く" className="mt-4 border-t border-workshop-border pt-4">
      <h2 className="text-base font-black">サイトの外で開く</h2>
      <p id={descriptionId} className="mt-2 text-sm text-workshop-muted">
        クリック時点のHTML/CSSと開き方をZIPにします。展開してindex.htmlを開けます。学習の進捗や判定履歴は含みません。
      </p>
      <button
        type="button"
        disabled={disabled || busy}
        aria-describedby={descriptionId}
        className="mt-3 inline-flex min-h-11 max-w-full items-center rounded-workshop-sm border border-workshop-border bg-workshop-surface px-3 py-2 text-sm font-black text-workshop-muted hover:bg-workshop-raised disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          void exportSource();
        }}
      >
        {busy ? 'ZIPを作成しています' : 'HTML/CSSを持ち出す'}
      </button>
      {message !== undefined ? (
        <p role={failed ? 'alert' : 'status'} className="mt-2 text-sm text-workshop-muted">
          {message}
        </p>
      ) : null}
    </section>
  );
}
