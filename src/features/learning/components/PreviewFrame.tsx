import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { RunnerConsoleRecord } from '../../../core/runtime/contracts';
import { StackedCard } from '../../../design-system/components/StackedCard';
import { previewFitScale } from './previewSizing';
import { RuntimeConsole, type ConsoleFreshness } from './RuntimeConsole';

export interface PreviewFrameProps {
  readonly onReady: (frame: HTMLIFrameElement) => void;
  readonly sandboxMode?: 'scripts' | 'scriptless';
  readonly consoleEnabled?: boolean;
  readonly primaryOutput?: 'preview' | 'console';
  readonly consoleRecords?: readonly RunnerConsoleRecord[];
  readonly consoleFreshness?: ConsoleFreshness;
  readonly consoleUpdateSequence?: number;
}

interface PreviewGeometry {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly fitScale: number;
}

/** opaque-originのsandboxを固定し、iframe nodeごとに一度だけRunnerへ参照を渡す。 */
export function PreviewFrame({
  onReady,
  sandboxMode = 'scripts',
  consoleEnabled = false,
  primaryOutput = 'preview',
  consoleRecords = [],
  consoleFreshness = 'current',
  consoleUpdateSequence,
}: PreviewFrameProps) {
  const preparedFrame = useRef<HTMLIFrameElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previewTabRef = useRef<HTMLButtonElement>(null);
  const consoleTabRef = useRef<HTMLButtonElement>(null);
  const outputId = useId();
  const previewTabId = `${outputId}-preview-tab`;
  const previewPanelId = `${outputId}-preview-panel`;
  const consoleTabId = `${outputId}-console-tab`;
  const consolePanelId = `${outputId}-console-panel`;
  const [displayMode, setDisplayMode] = useState<'fit' | 'actual'>('fit');
  const [activeOutput, setActiveOutput] = useState<'preview' | 'console'>(() =>
    consoleEnabled ? primaryOutput : 'preview',
  );
  const [geometry, setGeometry] = useState<PreviewGeometry>({
    frameWidth: 0,
    frameHeight: 0,
    fitScale: 1,
  });

  const setFrame = useCallback(
    (frame: HTMLIFrameElement | null) => {
      if (frame !== null && preparedFrame.current !== frame) {
        preparedFrame.current = frame;
        onReady(frame);
      }
    },
    [onReady],
  );

  useEffect(() => {
    const frame = preparedFrame.current;
    const container = scrollContainerRef.current;
    if (frame === null || container === null || typeof ResizeObserver === 'undefined') return;

    /** Runnerの固定Viewportと作業台幅から、全体表示に必要なgeometryを同期する。 */
    const updateGeometry = (): void => {
      const frameWidth = frame.offsetWidth;
      const frameHeight = frame.offsetHeight;
      const fitScale = previewFitScale(frameWidth, container.clientWidth);
      setGeometry((current) =>
        current.frameWidth === frameWidth &&
        current.frameHeight === frameHeight &&
        current.fitScale === fitScale
          ? current
          : { frameWidth, frameHeight, fitScale },
      );
    };

    const observer = new ResizeObserver(updateGeometry);
    observer.observe(frame);
    observer.observe(container);
    updateGeometry();
    return () => {
      observer.disconnect();
    };
  }, []);

  /** WAI-ARIA tabのroving focusと自動選択を同じ操作へまとめる。 */
  const handleOutputTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    let next: 'preview' | 'console' | undefined;
    switch (event.key) {
      case 'ArrowLeft':
        next = activeOutput === 'preview' ? 'console' : 'preview';
        break;
      case 'ArrowRight':
        next = activeOutput === 'console' ? 'preview' : 'console';
        break;
      case 'Home':
        next = 'preview';
        break;
      case 'End':
        next = 'console';
        break;
      default:
        return;
    }
    event.preventDefault();
    setActiveOutput(next);
    (next === 'preview' ? previewTabRef : consoleTabRef).current?.focus();
  };

  const canFit = geometry.fitScale < 1;
  const isFitDisplay = canFit && displayMode === 'fit';
  const previewCanvasStyle =
    geometry.frameWidth > 0
      ? {
          width: `${String(geometry.frameWidth)}px`,
          ...(isFitDisplay
            ? { height: `${String(geometry.frameHeight * geometry.fitScale)}px` }
            : {}),
        }
      : undefined;
  const frameDisplayStyle = isFitDisplay
    ? {
        position: 'absolute' as const,
        inset: 0,
        transform: `scale(${String(geometry.fitScale)})`,
        transformOrigin: 'top left',
      }
    : undefined;
  const consoleUpdateStatus =
    consoleUpdateSequence === undefined
      ? ''
      : consoleFreshness === 'previous-success'
        ? `前回成功時のConsoleです。${String(consoleUpdateSequence)}回目の実行結果を表示しています`
        : `Consoleを更新しました。${String(consoleRecords.length)}件。${String(consoleUpdateSequence)}回目の実行結果です`;

  return (
    <StackedCard
      as="section"
      aria-label={consoleEnabled ? '実行結果' : 'プレビュー'}
      className="tc-runtime-output-card"
    >
      <div className="tc-runtime-output-header">
        {consoleEnabled ? (
          <>
            <h2 className="sr-only">実行結果</h2>
            <div className="tc-runtime-output-tabs" role="tablist" aria-label="実行結果の表示">
              <button
                ref={previewTabRef}
                id={previewTabId}
                type="button"
                role="tab"
                aria-selected={activeOutput === 'preview'}
                aria-controls={previewPanelId}
                tabIndex={activeOutput === 'preview' ? 0 : -1}
                className="tc-runtime-output-tab"
                onClick={() => {
                  setActiveOutput('preview');
                }}
                onKeyDown={handleOutputTabKeyDown}
              >
                画面
              </button>
              <button
                ref={consoleTabRef}
                id={consoleTabId}
                type="button"
                role="tab"
                aria-selected={activeOutput === 'console'}
                aria-controls={consolePanelId}
                tabIndex={activeOutput === 'console' ? 0 : -1}
                className="tc-runtime-output-tab"
                onClick={() => {
                  setActiveOutput('console');
                }}
                onKeyDown={handleOutputTabKeyDown}
              >
                Console
              </button>
            </div>
          </>
        ) : (
          <div>
            <h2 className="text-xl font-black">プレビュー</h2>
          </div>
        )}
        <div>
          {canFit && activeOutput === 'preview' ? (
            <p className="mt-1 text-sm font-bold text-workshop-muted">
              {isFitDisplay
                ? `全体を${String(Math.round(geometry.fitScale * 100))}%で表示中`
                : '100%表示中。左右に動かして確認できます。'}
            </p>
          ) : null}
        </div>
        {canFit && activeOutput === 'preview' ? (
          <button
            type="button"
            aria-pressed={displayMode === 'actual'}
            onClick={() => {
              setDisplayMode((current) => (current === 'fit' ? 'actual' : 'fit'));
              if (scrollContainerRef.current !== null) scrollContainerRef.current.scrollLeft = 0;
            }}
            className="inline-flex min-h-11 items-center rounded-workshop-sm border-2 border-workshop-primary bg-workshop-surface px-3 py-2 text-sm font-black text-workshop-primary"
          >
            {isFitDisplay ? '100%で見る' : '全体表示に戻す'}
          </button>
        ) : null}
      </div>
      {consoleEnabled ? (
        <p
          className="sr-only"
          role="status"
          aria-label="Consoleの更新"
          aria-live="polite"
          aria-atomic="true"
        >
          {consoleUpdateStatus}
        </p>
      ) : null}
      <div
        id={consoleEnabled ? previewPanelId : undefined}
        role={consoleEnabled ? 'tabpanel' : undefined}
        aria-labelledby={consoleEnabled ? previewTabId : undefined}
        hidden={consoleEnabled && activeOutput !== 'preview'}
        className="tc-runtime-preview-panel"
      >
        <div
          ref={scrollContainerRef}
          data-testid="runtime-preview-scroll"
          role="region"
          aria-label="コードのプレビュー表示領域"
          tabIndex={0}
          className="mt-4 max-w-full overflow-x-auto pb-2"
        >
          <div className="relative" style={previewCanvasStyle}>
            <iframe
              ref={setFrame}
              title="コードのプレビュー"
              tabIndex={-1}
              sandbox={sandboxMode === 'scriptless' ? '' : 'allow-scripts'}
              referrerPolicy="no-referrer"
              style={frameDisplayStyle}
              className="box-content block h-[28rem] w-full max-w-none rounded-workshop-md border border-workshop-border bg-workshop-raised"
            />
          </div>
        </div>
      </div>
      {consoleEnabled ? (
        <div
          id={consolePanelId}
          role="tabpanel"
          aria-labelledby={consoleTabId}
          hidden={activeOutput !== 'console'}
          className="tc-runtime-console-panel"
        >
          <RuntimeConsole records={consoleRecords} freshness={consoleFreshness} />
        </div>
      ) : null}
    </StackedCard>
  );
}
