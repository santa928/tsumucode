import type { Page } from '@playwright/test';

interface OperationObservation {
  label: string;
  startedAt: number;
  paintedAfterMs?: number;
  compilePendingAtClick: boolean;
}

interface OperationProbe {
  pendingCompiles: number;
  cancelledCompiles: number;
  observations: OperationObservation[];
}

type ProbeWindow = Window & { __typescriptOperationProbe?: OperationProbe };

/** 実Workerの入出力は変えず、操作受付から状態表示の次の描画機会までを観測する。 */
export async function installTypeScriptOperationProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const probe: OperationProbe = {
      pendingCompiles: 0,
      cancelledCompiles: 0,
      observations: [],
    };
    (window as ProbeWindow).__typescriptOperationProbe = probe;
    const compiling = new WeakSet<Worker>();
    const postMessage = Reflect.get(Worker.prototype, 'postMessage');
    const terminate = Reflect.get(Worker.prototype, 'terminate');
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]): void {
      const message = args[0];
      if (
        typeof message === 'object' &&
        message !== null &&
        'kind' in message &&
        message.kind === 'compile'
      ) {
        compiling.add(this);
        probe.pendingCompiles += 1;
        this.addEventListener(
          'message',
          () => {
            if (compiling.delete(this)) probe.pendingCompiles -= 1;
          },
          // Clientが通常の応答handlerでterminateする前に、正常完了と取消を区別する。
          { once: true, capture: true },
        );
      }
      Reflect.apply(postMessage, this, args);
    };
    Worker.prototype.terminate = function (this: Worker): void {
      if (compiling.delete(this)) {
        probe.pendingCompiles -= 1;
        probe.cancelledCompiles += 1;
      }
      Reflect.apply(terminate, this, []);
    };
    document.addEventListener(
      'click',
      (event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        const label = button?.textContent.trim();
        if (
          !event.isTrusted ||
          !['プレビューを更新', '判定する', '実行を停止'].includes(label ?? '')
        )
          return;
        const observation: OperationObservation = {
          label: label!,
          startedAt: performance.now(),
          compilePendingAtClick: probe.pendingCompiles > 0,
        };
        probe.observations.push(observation);
        const ready = (): boolean => {
          const buttons = [...document.querySelectorAll('button')];
          if (label === '実行を停止') {
            return (
              buttons.some((item) => item.textContent.trim() === '判定する' && !item.disabled) &&
              !buttons.some((item) => item.textContent.trim() === '実行を停止')
            );
          }
          return (
            buttons.some((item) => item.textContent.trim() === '実行を停止' && !item.disabled) &&
            buttons.some(
              (item) =>
                item.disabled &&
                /更新しています|判定しています|編集権を確認しています/u.test(item.textContent),
            )
          );
        };
        const observePaint = (): void => {
          if (performance.now() - observation.startedAt > 20_000) return;
          requestAnimationFrame(() => {
            if (!ready()) {
              observePaint();
              return;
            }
            // DOM更新だけを完了時刻にせず、一度描画機会を経て状態が維持されたことも確認する。
            requestAnimationFrame(() => {
              if (ready()) observation.paintedAfterMs = performance.now() - observation.startedAt;
              else observePaint();
            });
          });
        };
        observePaint();
      },
      { capture: true },
    );
  });
}

/** 観測値だけを読み出す。性能予算の合意や公開許可を判定しない。 */
export async function readTypeScriptOperationProbe(page: Page): Promise<OperationProbe> {
  return page.evaluate(() => {
    const probe = (window as ProbeWindow).__typescriptOperationProbe;
    if (!probe) throw new Error('TypeScript操作の観測がありません');
    return probe;
  });
}
