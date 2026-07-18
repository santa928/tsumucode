import { expect, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test';
import { testBasePath } from './testBasePath';

const EXERCISE_URL = `${testBasePath()}#/courses/html-css/lessons/html-css-ch00-l01/exercises/html-css-ch00-l01-e01`;
const UNHANDLED_REJECTION_BINDING = '__tsumucodeTestReportUnhandledRejection';

interface RuntimeErrorState {
  readonly pageErrors: string[];
  readonly unhandledRejections: string[];
  readonly consoleErrors: string[];
}

export interface RuntimeErrorObserverOptions {
  /** trueを返したconsole errorは既知の自動化artifactとしてerror集計から除く。 */
  readonly handleConsoleError?: (message: ConsoleMessage) => boolean;
}

const observedContexts = new WeakSet<BrowserContext>();
const observedPages = new WeakSet<Page>();
const runtimeErrors = new WeakMap<BrowserContext, RuntimeErrorState>();

export interface RuntimeErrors {
  readonly pageErrors: readonly string[];
  readonly unhandledRejections: readonly string[];
  readonly consoleErrors: readonly string[];
}

/** PageイベントをContext共通stateへ一度だけ集約する。 */
function observePage(
  page: Page,
  state: RuntimeErrorState,
  options: RuntimeErrorObserverOptions,
): void {
  if (observedPages.has(page)) return;
  observedPages.add(page);
  page.on('pageerror', (error) => {
    state.pageErrors.push(`${error.name}: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (options.handleConsoleError?.(message) === true) return;
    state.consoleErrors.push(message.text());
  });
}

/** topと全frameの未処理Promiseをnavigationを越えるContext bindingへ送る。 */
async function installUnhandledRejectionProbe(context: BrowserContext): Promise<void> {
  await context.exposeFunction(UNHANDLED_REJECTION_BINDING, (detail: unknown) => {
    const state = runtimeErrors.get(context);
    if (state !== undefined && typeof detail === 'string') state.unhandledRejections.push(detail);
  });
  await context.addInitScript((bindingName) => {
    const describe = (reason: unknown): string => {
      if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
      if (typeof reason === 'string') return reason;
      try {
        return JSON.stringify(reason);
      } catch {
        return String(reason);
      }
    };
    window.addEventListener('unhandledrejection', (event) => {
      const report = (window as unknown as Record<string, unknown>)[bindingName];
      if (typeof report !== 'function') return;
      void (report as (detail: string) => Promise<void>)(describe(event.reason)).catch(
        () => undefined,
      );
    });
  }, UNHANDLED_REJECTION_BINDING);
}

/** Context内の現在・将来の全Pageとframeを共通error observerへ登録する。 */
export async function observeRuntimeContext(
  context: BrowserContext,
  options: RuntimeErrorObserverOptions = {},
): Promise<void> {
  if (observedContexts.has(context)) return;
  observedContexts.add(context);
  const state: RuntimeErrorState = {
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  };
  runtimeErrors.set(context, state);
  await installUnhandledRejectionProbe(context);
  for (const page of context.pages()) observePage(page, state, options);
  context.on('page', (page) => {
    observePage(page, state, options);
  });
}

/** 手元のPageから所属Context全体を共通error observerへ登録する。 */
export async function observeRuntimePage(
  page: Page,
  options: RuntimeErrorObserverOptions = {},
): Promise<void> {
  await observeRuntimeContext(page.context(), options);
}

/** Desktop編集fixtureをHash routeから開き、初回Preview完了まで待つ。 */
export async function openRuntimeFixture(page: Page): Promise<void> {
  await observeRuntimePage(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(EXERCISE_URL);
  await page.getByTestId('code-workspace').waitFor();
  await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled();
  await expect(page.getByTestId('runtime-preview-frame').locator('iframe')).toBeVisible();
}

/** CodeMirrorの選択中fileをlearner payloadへ置き換え、React state反映まで待つ。 */
export async function replaceEditorText(page: Page, value: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(value);
  await expect(editor).toContainText('安全');
}

/** test中に収集したpageerrorと全frameのunhandledrejectionを返す。 */
export async function readRuntimeErrors(page: Page): Promise<RuntimeErrors> {
  const state = runtimeErrors.get(page.context());
  return {
    pageErrors: [...(state?.pageErrors ?? [])],
    unhandledRejections: [...(state?.unhandledRejections ?? [])],
    consoleErrors: [...(state?.consoleErrors ?? [])],
  };
}

/** 意図的なerror observer検証用に現在の集計を返し、同じContextを空にする。 */
export async function takeRuntimeErrors(page: Page): Promise<RuntimeErrors> {
  const state = runtimeErrors.get(page.context());
  if (state === undefined) return readRuntimeErrors(page);
  return {
    pageErrors: state.pageErrors.splice(0),
    unhandledRejections: state.unhandledRejections.splice(0),
    consoleErrors: state.consoleErrors.splice(0),
  };
}

/** Browser security拒否をtest内で明示検証できるよう、現在のconsole errorを消費する。 */
export function takeConsoleErrors(page: Page): readonly string[] {
  return runtimeErrors.get(page.context())?.consoleErrors.splice(0) ?? [];
}

/** 残存要素を操作するquiet window中にtop URLが一度も変わらないことを観測する。 */
export async function observeStableTopUrl(page: Page, expectedUrl: string): Promise<boolean> {
  return page.evaluate(async (expected) => {
    for (let frame = 0; frame < 12; frame += 1) {
      if (window.location.href !== expected) return false;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    }
    return window.location.href === expected;
  }, expectedUrl);
}
