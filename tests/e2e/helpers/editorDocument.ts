import type { Locator, Page } from '@playwright/test';

/** フォーカスと選択範囲を変え、全文選択・通常Copyで画面外の行も含む本文を読む。 */
export async function selectAllAndCopyEditorDocument(page: Page, editor: Locator): Promise<string> {
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  const capture = await editor.evaluateHandle((element) => {
    type Result = { ok: true; text: string } | { ok: false; error: string };
    const owner = element.ownerDocument;
    let done = false;
    let settle!: (result: Result) => void;
    const promise = new Promise<Result>((resolve) => {
      settle = resolve;
    });
    const finish = (result: Result) => {
      if (done) return;
      done = true;
      owner.removeEventListener('copy', listener, false);
      window.clearTimeout(timer);
      settle(result);
    };
    const listener = (event: ClipboardEvent) => {
      if (!(event.target instanceof Node) || !element.contains(event.target)) return;
      const data = event.clipboardData;
      if (!event.isTrusted || !event.defaultPrevented || !data?.types.includes('text/plain')) {
        finish({ ok: false, error: '通常Copyの処理済みtext/plainを取得できません' });
        return;
      }
      finish({ ok: true, text: data.getData('text/plain') });
    };
    // CodeMirrorが本文を書き込んだ後のbubble phaseで読み、OS clipboardの権限は使わない。
    owner.addEventListener('copy', listener, false);
    const timer = window.setTimeout(() => {
      finish({ ok: false, error: '通常Copyを5000ms以内に観測できません' });
    }, 5000);
    return {
      promise,
      dispose: () => {
        finish({ ok: false, error: 'Copy観測を終了しました' });
      },
    };
  });
  try {
    await page.keyboard.press('ControlOrMeta+C');
    const result = await capture.evaluate((probe) => probe.promise);
    if (!result.ok) throw new Error(result.error);
    return result.text;
  } finally {
    // Page終了時はlistener/timerも破棄済み。通常終了・失敗時は明示的に解放する。
    await capture
      .evaluate((probe) => {
        probe.dispose();
      })
      .catch(() => {});
    await capture.dispose().catch(() => {});
  }
}
