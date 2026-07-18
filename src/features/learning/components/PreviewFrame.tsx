import { useCallback, useEffect, useRef, useState } from 'react';
import { StackedCard } from '../../../design-system/components/StackedCard';
import { previewFitScale } from './previewSizing';

interface PreviewFrameProps {
  readonly onReady: (frame: HTMLIFrameElement) => void;
  readonly sandboxMode?: 'scripts' | 'scriptless';
}

interface PreviewGeometry {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly fitScale: number;
}

/** opaque-originのsandboxを固定し、iframe nodeごとに一度だけRunnerへ参照を渡す。 */
export function PreviewFrame({ onReady, sandboxMode = 'scripts' }: PreviewFrameProps) {
  const preparedFrame = useRef<HTMLIFrameElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [displayMode, setDisplayMode] = useState<'fit' | 'actual'>('fit');
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

  return (
    <StackedCard as="section" aria-label="プレビュー">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">プレビュー</h2>
          {canFit ? (
            <p className="mt-1 text-sm font-bold text-workshop-muted">
              {isFitDisplay
                ? `全体を${String(Math.round(geometry.fitScale * 100))}%で表示中`
                : '100%表示中。左右に動かして確認できます。'}
            </p>
          ) : null}
        </div>
        {canFit ? (
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
    </StackedCard>
  );
}
