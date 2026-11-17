import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { auditGuardedPreview } from './helpers/guardedFrameAxe';
import { testBasePath } from './helpers/testBasePath';

const lesson = 'typescript-ch06-l03';
const exerciseUrl = `${testBasePath()}#/courses/typescript/lessons/${lesson}/exercises/${lesson}-e01`;
const preview = '[data-testid="runtime-preview-frame"] iframe';

test('既定の全ルールと実プレビューを検査し、親とiframeの違反を検出する', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    if (window === window.top) return;
    const probe = { timeoutHook: 0, intervalHook: 0, timeoutRejected: 0, intervalRejected: 0 };
    const define = Object.defineProperty;
    const apply = Reflect.apply.bind(Reflect);
    define(window, '__timerProbe', { value: probe });
    Object.defineProperty = function (target, key, descriptor) {
      if (
        target === window &&
        (key === 'setTimeout' || key === 'setInterval') &&
        typeof descriptor.value === 'function'
      ) {
        const original = descriptor.value as (this: Window, ...args: unknown[]) => unknown;
        const timeout = key === 'setTimeout';
        if (timeout) probe.timeoutHook++;
        else probe.intervalHook++;
        descriptor = {
          ...descriptor,
          value: (...args: unknown[]) => {
            const result = apply(original, window, args);
            if (result === 0) {
              if (timeout) probe.timeoutRejected++;
              else probe.intervalRejected++;
            }
            return result;
          },
        };
      }
      return define(target, key, descriptor);
    };
  });
  await page.goto(exerciseUrl);
  await expect(page.getByRole('tab', { name: 'main.ts', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const frame = page.locator(preview).contentFrame();
  await expect(frame.locator('body')).toBeVisible();
  const timerProbe = () =>
    frame.locator('html').evaluate(
      () =>
        (
          window as unknown as {
            __timerProbe: {
              timeoutHook: number;
              intervalHook: number;
              timeoutRejected: number;
              intervalRejected: number;
            };
          }
        ).__timerProbe,
    );
  const before = await timerProbe();
  expect(before.timeoutHook).toBe(1);
  expect(before.intervalHook).toBe(1);
  const audit = await auditGuardedPreview(page);
  const after = await timerProbe();
  expect(after.timeoutRejected).toBe(before.timeoutRejected);
  expect(after.intervalRejected).toBe(before.intervalRejected);
  expect(audit.enabledRules).toEqual(
    axe
      .getRules()
      .filter((rule) => rule.enabled)
      .map((rule) => rule.ruleId),
  );
  expect(
    audit.batches.flatMap(({ rules }) => rules.filter((rule) => rule !== 'frame-tested')).sort(),
  ).toEqual(audit.enabledRules.filter((rule) => rule !== 'frame-tested').sort());
  expect(audit.batches.flatMap(({ result }) => result.violations)).toEqual([]);
  await page.evaluate(() => {
    const image = document.createElement('img');
    image.id = 'axe-parent-violation';
    image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    image.width = image.height = 20;
    document.body.append(image);
  });
  await frame.locator('body').evaluate((body) => {
    const image = document.createElement('img');
    image.id = 'axe-frame-violation';
    image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    image.width = image.height = 20;
    body.append(image);
  });
  const seeded = await auditGuardedPreview(page);
  const imageAlt = seeded.batches
    .flatMap(({ result }) => result.violations)
    .find((rule) => rule.id === 'image-alt');
  expect(imageAlt?.nodes.map((node) => node.target)).toEqual(
    expect.arrayContaining([['#axe-parent-violation'], ['iframe', '#axe-frame-violation']]),
  );
});

for (const [label, html] of [
  ['iframeがない', '<main data-testid="runtime-preview-frame"></main>'],
  [
    '別のiframeのみ',
    '<iframe title="別のframe" srcdoc="<p>別のframe</p>"></iframe><main data-testid="runtime-preview-frame"></main>',
  ],
  [
    '対象と別のiframeが共存',
    '<iframe title="別のframe" srcdoc="<p>別のframe</p>"></iframe><main data-testid="runtime-preview-frame"><iframe title="対象" srcdoc="<p>対象</p>"></iframe></main>',
  ],
] as const) {
  test(`${label}場合は検査成功にしない`, async ({ page }) => {
    page.setDefaultTimeout(500);
    await page.setContent(html);
    await expect(auditGuardedPreview(page)).rejects.toThrow();
  });
}

test('iframe の部分検査が失敗した場合は検査成功にしない', async ({ page }) => {
  await page.setContent(
    '<main data-testid="runtime-preview-frame"><iframe title="プレビュー" sandbox="allow-scripts" srcdoc="<html lang=ja><title>テスト</title><main>内容</main></html>"></iframe></main>',
  );
  const frame = page.locator(preview).contentFrame();
  await frame.locator('html').evaluate(() => {
    const probe = { calls: 0 };
    Object.defineProperty(window, '__axeFailureProbe', { value: probe });
    let current = (window as unknown as { axe?: Record<string, unknown> }).axe;
    const wrap = (value: typeof current) =>
      value &&
      new Proxy(value, {
        get(target, key) {
          if (key === 'runPartial')
            return () => {
              probe.calls++;
              return Promise.reject(new Error('controlled-frame-partial-failure'));
            };
          return target[key as string];
        },
      });
    let exposed = wrap(current);
    Object.defineProperty(window, 'axe', {
      configurable: true,
      get: () => exposed,
      set: (value: typeof current) => {
        current = value;
        exposed = wrap(value);
      },
    });
  });
  await expect(auditGuardedPreview(page)).rejects.toThrow('Preview iframe was not audited');
  const probe = await frame
    .locator('html')
    .evaluate(
      () => (window as unknown as { __axeFailureProbe: { calls: number } }).__axeFailureProbe,
    );
  expect(probe.calls).toBeGreaterThan(0);
});

test('バッチ間にプレビューDOMが変わった場合は検査成功にしない', async ({ page }) => {
  await page.setContent(
    '<main data-testid="runtime-preview-frame"><iframe title="プレビュー" sandbox="allow-scripts" srcdoc="<html lang=ja><title>テスト</title><main>内容</main></html>"></iframe></main>',
  );
  const audit = auditGuardedPreview(page).then(
    () => undefined,
    (error: unknown) => error,
  );
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe))
    .toBe('object');
  await page
    .locator(preview)
    .contentFrame()
    .locator('body')
    .evaluate((body) => {
      body.setAttribute('data-changed-during-audit', 'true');
    });
  expect(await audit).toEqual(
    expect.objectContaining({ message: 'Document changed during Axe audit' }),
  );
});

for (const [scope, location] of [
  ['parent', 'lang'],
  ['parent', 'head'],
  ['frame', 'lang'],
  ['frame', 'head'],
] as const) {
  test(`バッチ間の ${scope} ${location} 変更を拒否する`, async ({ page }) => {
    await page.setContent(
      '<main data-testid="runtime-preview-frame"><iframe title="プレビュー" sandbox="allow-scripts" srcdoc="<html lang=ja><head><title>テスト</title></head><body><main>内容</main></body></html>"></iframe></main>',
    );
    const audit = auditGuardedPreview(page).then(
      () => undefined,
      (error: unknown) => error,
    );
    await expect
      .poll(() => page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe))
      .toBe('object');
    const root =
      scope === 'parent'
        ? page.locator('html')
        : page.locator(preview).contentFrame().locator('html');
    await root.evaluate((html, field) => {
      if (field === 'lang') html.setAttribute('lang', 'en');
      else html.ownerDocument.title = '変更後';
    }, location);
    expect(await audit).toEqual(
      expect.objectContaining({ message: 'Document changed during Axe audit' }),
    );
  });
}

test('timer枠が埋まった iframe を未検査のまま成功にしない', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto(exerciseUrl);
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const frame = page.locator(preview).contentFrame();
  const handles = await frame
    .locator('html')
    .evaluate(() => Array.from({ length: 10 }, () => window.setInterval(() => {}, 60_000)));
  expect(handles.every((handle) => handle !== 0)).toBe(true);
  await expect(auditGuardedPreview(page)).rejects.toThrow(
    /Preview iframe was not audited|Axe batch timed out/,
  );
});
