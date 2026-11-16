import { expect, test, type Page } from '@playwright/test';
import { watchPublicFaults } from '../e2e/helpers/publicOperationFaultProbe';

function report(failures: readonly string[], resources: ReadonlySet<string>) {
  for (const label of failures) console.log('probe-fault=' + label);
  for (const label of [...resources].sort()) console.log('probe-resource=' + label);
}

test('observes a representative fixed-source preview without claiming full release coverage', async ({ page, browser }, info) => {
  console.log('probe-phase=normal-test-started');
  const failures: string[] = [], resources = new Set<string>();
  watchPublicFaults(page, 'primary', failures, resources);
  try {
    await page.goto('./#/');
    await expect(page.getByRole('banner')).toBeVisible();
    await page.goto('./#/library/html-css/lessons/html-css-ch00-l01/read');
    await expect(page.getByRole('navigation', { name: 'このレッスンの目次' })).toBeVisible();
    await page.reload();
    await page.waitForLoadState('networkidle');
    const baseURL = info.project.use.baseURL;
    if (typeof baseURL !== 'string') throw new Error('Missing fixed preview base');
    const context = await browser.newContext({ baseURL });
    try {
      const imported = await context.newPage();
      watchPublicFaults(imported, 'transfer', failures, resources);
      await imported.goto('./#/');
      await expect(imported.getByRole('banner')).toBeVisible();
      await imported.waitForLoadState('networkidle');
    } finally {
      await context.close();
    }
    expect(resources.has('primary-document')).toBe(true);
    expect(resources.has('transfer-document')).toBe(true);
    expect(failures).toEqual([]);
    await info.attach('synthetic-proof-boundary', { body: Buffer.from('fixed'), contentType: 'text/plain' });
    expect(failures).toEqual([]);
    console.log('probe-normal=passed');
  } finally {
    report(failures, resources);
  }
});

test('detects synthetic console errors and intercepted aborts on both pages', async ({ page, browser }, info) => {
  console.log('probe-phase=synthetic-test-started');
  const failures: string[] = [], resources = new Set<string>();
  const run = async (target: Page) => {
    await target.route('https://fixture.invalid/**', (route) => route.abort());
    await target.setContent('<!doctype html><title>synthetic</title>');
    const failed = target.waitForEvent('requestfailed');
    await target.evaluate(async () => {
      console.error('synthetic-console-marker');
      await fetch('https://fixture.invalid/synthetic-abort').catch(() => undefined);
    });
    await failed;
  };
  try {
    watchPublicFaults(page, 'primary', failures, resources);
    await info.attach('synthetic-proof-boundary', { body: Buffer.from('fixed'), contentType: 'text/plain' });
    await run(page);
    const baseURL = info.project.use.baseURL;
    if (typeof baseURL !== 'string') throw new Error('Missing fixed preview base');
    const context = await browser.newContext({ baseURL });
    try {
      const imported = await context.newPage();
      watchPublicFaults(imported, 'transfer', failures, resources);
      await run(imported);
    } finally {
      await context.close();
    }
    expect(failures).toContain('primary-console-error');
    expect(failures).toContain('primary-request-failed');
    expect(failures).toContain('transfer-console-error');
    expect(failures).toContain('transfer-request-failed');
    expect(JSON.stringify(failures)).not.toContain('synthetic-console-marker');
    console.log('probe-synthetic=passed');
  } finally {
    report(failures, resources);
  }
});
