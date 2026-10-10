/** ZIP用Anchorを一時設置し、Browserへ渡した後のタスクでObject URLを解放する。 */
export function downloadArchive(archive: Uint8Array<ArrayBuffer>, filename: string): void {
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
  } finally {
    try {
      anchor?.remove();
    } finally {
      // 即時revokeによるBrowserごとのdownload取消を避ける。
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
    }
  }
}
