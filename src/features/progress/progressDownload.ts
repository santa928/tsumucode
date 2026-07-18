export interface ProgressDownloadAnchor {
  href: string;
  download: string;
  click(): void;
}

export interface ProgressDownloadDependencies {
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
  readonly createAnchor: () => ProgressDownloadAnchor;
  readonly appendAnchor: (anchor: ProgressDownloadAnchor) => void;
  readonly removeAnchor: (anchor: ProgressDownloadAnchor) => void;
  readonly now: () => Date;
}

/** Browser DOMへ一時Anchorを追加する既定download依存を作る。 */
function browserDependencies(): ProgressDownloadDependencies {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => {
      URL.revokeObjectURL(url);
    },
    createAnchor: () => document.createElement('a'),
    appendAnchor: (anchor) => {
      document.body.append(anchor as HTMLAnchorElement);
    },
    removeAnchor: (anchor) => {
      (anchor as HTMLAnchorElement).remove();
    },
    now: () => new Date(),
  };
}

/** 進捗JSONを日付付きFileとして保存し、一時DOM資源を成功・失敗とも解放する。 */
export function downloadProgressJson(
  json: string,
  dependencies: ProgressDownloadDependencies = browserDependencies(),
): void {
  const url = dependencies.createObjectUrl(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
  );
  let anchor: ProgressDownloadAnchor | undefined;
  try {
    anchor = dependencies.createAnchor();
    anchor.href = url;
    anchor.download = `tsumucode-progress-${dependencies.now().toISOString().slice(0, 10)}.json`;
    dependencies.appendAnchor(anchor);
    anchor.click();
  } finally {
    if (anchor !== undefined) dependencies.removeAnchor(anchor);
    dependencies.revokeObjectUrl(url);
  }
}
