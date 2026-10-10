/** 制作2教材のクリック時点のSourceを、保存状態へ書き込まず持ち出す副操作。 */
import { useEffect, useId, useRef, useState } from 'react';

interface PortableNextExportProps {
  readonly workspaceId: string;
  readonly files: Readonly<Record<string, string>>;
  readonly disabled: boolean;
}

/** ライブラリ読み込みを操作時まで遅らせ、画面を離れた後のDownloadを抑止する。 */
export function PortableNextExport({ workspaceId, files, disabled }: PortableNextExportProps) {
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

  /** 非同期Importの前に全Sourceを固定し、編集中の別Revisionを混ぜない。 */
  async function exportSource(): Promise<void> {
    if (disabled || pending.current) return;
    const snapshot = { ...files };
    pending.current = true;
    setBusy(true);
    setMessage(undefined);
    setFailed(false);
    try {
      const { createPortableNextArchive, downloadPortableNextArchive } =
        await import('./portableNextArchive');
      if (!mounted.current) return;
      downloadPortableNextArchive(workspaceId, createPortableNextArchive(workspaceId, snapshot));
      setMessage('ZIPを作成しました。保存先はブラウザで確認してください。');
    } catch (error) {
      if (!mounted.current) return;
      setFailed(true);
      setMessage(
        error instanceof Error &&
          (error.message.includes('100 KiB') || error.message.includes('そろっていません'))
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
        クリック時点の制作Source、画像、固定依存と起動手順をZIPにします。展開後はREADMEに沿って起動してください。学習の進捗や判定履歴は含みません。
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
        {busy ? 'ZIPを作成しています' : '制作Sourceを持ち出す'}
      </button>
      {message !== undefined ? (
        <p role={failed ? 'alert' : 'status'} className="mt-2 text-sm text-workshop-muted">
          {message}
        </p>
      ) : null}
    </section>
  );
}
