import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import axe, { type AxeResults } from 'axe-core';
import { createHash } from 'node:crypto';

const FRAME_TESTED = 'frame-tested';
const RULES_PER_BATCH = 5;
const BATCH_DEADLINE_MS = 15_000;
const PREVIEW_FRAME = '[data-testid="runtime-preview-frame"] iframe';

/** 実行ガードの timer 上限を変えず、既定の全ルールを iframe を含めて検査する。 */
export async function auditGuardedPreview(page: Page) {
  const enabledRules = axe
    .getRules()
    .filter((rule) => rule.enabled)
    .map((rule) => rule.ruleId);
  expect(new Set(enabledRules).size).toBe(enabledRules.length);
  expect(enabledRules).toContain(FRAME_TESTED);
  const frame = page.locator(PREVIEW_FRAME);
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(frame).toHaveCount(1);
  const srcdoc = await frame.getAttribute('srcdoc');
  expect(srcdoc).toBeTruthy();
  const frameDocument = frame.contentFrame().locator('html');
  const origin = await frameDocument.evaluate(() => performance.timeOrigin);
  const state = async () => {
    const read = (root: Element) => {
      const document = root.ownerDocument;
      const controls = [...document.querySelectorAll('input, textarea, select')].map((element) => ({
        value: (element as HTMLInputElement).value,
        checked: element instanceof HTMLInputElement ? element.checked : undefined,
      }));
      return { html: root.outerHTML, controls, active: document.activeElement?.outerHTML };
    };
    const parent = await page.locator('html').evaluate(read);
    const child = await frame.contentFrame().locator('html').evaluate(read);
    return createHash('sha256').update(JSON.stringify({ parent, child })).digest('hex');
  };
  const initialState = await state();
  const otherRules = enabledRules.filter((rule) => rule !== FRAME_TESTED);
  const batches: { rules: string[]; result: AxeResults }[] = [];

  for (let index = 0; index < otherRules.length; index += RULES_PER_BATCH) {
    const rules = [...otherRules.slice(index, index + RULES_PER_BATCH), FRAME_TESTED];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Axe batch timed out: ${rules.join(', ')}`));
      }, BATCH_DEADLINE_MS);
    });
    let result: AxeResults;
    try {
      result = await Promise.race([new AxeBuilder({ page }).withRules(rules).analyze(), deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    const reported = new Set(
      [result.violations, result.passes, result.incomplete, result.inapplicable]
        .flat()
        .map((rule) => rule.id),
    );
    expect([...reported].sort()).toEqual([...rules].sort());
    const configuredRules = () => {
      const core = (window as unknown as { axe: typeof axe }).axe;
      return {
        version: core.version,
        enabled: core
          .getRules()
          .filter((rule) => rule.enabled)
          .map((rule) => rule.ruleId),
      };
    };
    expect(await page.evaluate(configuredRules)).toEqual({
      version: axe.version,
      enabled: enabledRules,
    });
    expect(await frameDocument.evaluate(configuredRules)).toEqual({
      version: axe.version,
      enabled: enabledRules,
    });
    const tested = result.passes.find((rule) => rule.id === FRAME_TESTED);
    if (!tested) throw new Error('Preview iframe was not audited');
    expect(result.incomplete.map((rule) => rule.id)).not.toContain(FRAME_TESTED);
    const targets = tested.nodes.map((node) => node.target);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toHaveLength(1);
    const selector = targets[0]![0];
    expect(typeof selector).toBe('string');
    expect(
      await page
        .locator(selector as string)
        .evaluate(
          (element, expected) => element === document.querySelector(expected),
          PREVIEW_FRAME,
        ),
    ).toBe(true);
    expect(await frame.getAttribute('srcdoc')).toBe(srcdoc);
    expect(await frameDocument.evaluate(() => performance.timeOrigin)).toBe(origin);
    if ((await state()) !== initialState) throw new Error('Document changed during Axe audit');
    batches.push({ rules, result });
  }

  return { version: axe.version, enabledRules, batches };
}
