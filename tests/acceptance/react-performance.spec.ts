import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { readStoredProgress, waitForDraftSaved } from '../e2e/helpers/progress';
import { testServerUrl } from '../e2e/helpers/testBasePath';

const { exercises } = await loadAuthoringCourse('content/react');
const representatives = ['react-ch01-l01-e01', 'react-ch01-l11-e01', 'react-ch03-l01-e01'];

/** 実Controllerの完了Measureを読む。描画開始や前回の採点結果で代用しない。 */
async function measure(page: Page, button: string, name: string): Promise<number> {
  const trigger = page.getByRole('button', { name: button, exact: true });
  await expect(trigger).toBeEnabled({ timeout: 60_000 });
  await page.evaluate((name) => {
    performance.clearMeasures(name);
  }, name);
  await trigger.click();
  await expect
    .poll(
      () => page.evaluate((name) => performance.getEntriesByName(name).at(-1)?.duration, name),
      { timeout: 60000 },
    )
    .not.toBeUndefined();
  if (name === 'tsumucode:preview-update') await expect(trigger).toBeEnabled({ timeout: 60_000 });
  return page.evaluate((name) => {
    const value = performance.getEntriesByName(name).at(-1)?.duration;
    if (value === undefined || !Number.isFinite(value)) throw new Error('完了Measureがありません');
    return value;
  }, name);
}

/** 小標本のnearest-rank p95。物理端末や大規模分布の保証へ拡張しない。 */
function p95(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const value = ordered[Math.ceil(ordered.length * 0.95) - 1];
  if (value === undefined) throw new Error('測定値が必要です');
  return value;
}

for (const id of representatives) {
  test(`${id}の通常UIをCPU4x/低速回線で観察し暖機5回のp95を記録する`, async ({
    page,
    browser,
  }, info) => {
    test.skip(info.project.name !== 'chromium', 'CDPのCPU/回線エミュレーションを明示する。');
    test.setTimeout(300_000);
    const exercise = exercises.find((exercise) => exercise.id === id);
    if (!exercise) throw new Error('代表Exerciseがありません');
    const lesson = id.replace(/-e\d+$/u, '');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
    });
    const started = Date.now();
    await page.goto(`${testServerUrl()}#/courses/react/lessons/${lesson}/exercises/${id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: exercise.title, exact: true }),
    ).toBeVisible();
    const root = page.frameLocator('iframe[title="Reactコードのプレビュー"]').locator('#root > *');
    // 最初のProps教材は型修正が課題なので、未修正の描画を待たない。
    const initialOutcome = id === 'react-ch01-l01-e01' ? 'type-error' : 'rendered';
    if (initialOutcome === 'type-error') {
      await expect(page.getByRole('list', { name: 'コード診断' })).toContainText(
        "Type 'number' is not assignable to type 'string'.",
        { timeout: 60000 },
      );
      await expect(root).toHaveCount(0);
    } else {
      await expect(root.first()).toBeVisible({ timeout: 60000 });
    }
    const initialOutcomeMs = Date.now() - started;
    for (const file of exercise.files.filter(({ editable }) => editable)) {
      const solution = exercise.solutionFiles.find(({ path }) => path === file.path);
      if (!solution) throw new Error('Solutionがありません');
      await page.getByRole('tab', { name: file.path, exact: true }).click();
      const editor = page.getByRole('textbox', {
        name: `${file.path} のコードエディター`,
        exact: true,
      });
      await editor.focus();
      await editor.press('Control+A');
      await page.keyboard.insertText(solution.content);
      await expect
        .poll(
          async () =>
            (await readStoredProgress(page)).drafts.find(
              (row) => row['workspaceId'] === exercise.workspaceId,
            )?.['files'],
        )
        .toMatchObject({ [file.path]: solution.content });
      await waitForDraftSaved(page);
    }
    const firstSolutionPreviewMs = await measure(
      page,
      'プレビューを更新',
      'tsumucode:preview-update',
    );
    await expect(root.first()).toBeVisible({ timeout: 60000 });
    const preview: number[] = [],
      validation: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const previewMs = await measure(page, 'プレビューを更新', 'tsumucode:preview-update');
      await expect(root.first()).toBeVisible();
      const validationMs = await measure(page, '判定する', 'tsumucode:validation');
      await expect
        .poll(async () => {
          const draft = (await readStoredProgress(page)).drafts.find(
            (row) => row['workspaceId'] === exercise.workspaceId,
          );
          return (draft?.['validationHistory'] as { status: string }[] | undefined)?.at(-1)?.status;
        })
        .toBe('pass');
      if (id === 'react-ch03-l01-e01') {
        // Capstoneは合格時に完成画面へ移るので、保存した同じSolutionを通常経路で開き直す。
        await expect(
          page.getByRole('heading', { level: 1, name: 'ピースがはまりました' }),
        ).toBeVisible();
        await page.goto(`${testServerUrl()}#/courses/react/lessons/${lesson}/exercises/${id}`);
        await expect(
          page.getByRole('heading', { level: 1, name: exercise.title, exact: true }),
        ).toBeVisible();
        await expect(root.first()).toBeVisible({ timeout: 60_000 });
      } else {
        const result = page.getByRole('dialog', { name: '判定結果', exact: true });
        await expect(result).toBeVisible();
        await result.getByRole('button', { name: '閉じる', exact: true }).click();
        await expect(result).toBeHidden();
      }
      if (index > 0) {
        preview.push(previewMs);
        validation.push(validationMs);
      }
    }
    await writeFile(
      info.outputPath('react-performance-observation.json'),
      JSON.stringify(
        {
          exerciseId: id,
          browser: browser.version(),
          viewport: page.viewportSize(),
          cpuSlowdown: 4,
          rttMs: 150,
          downloadBitsPerSecond: 1_600_000,
          uploadBitsPerSecond: 750_000,
          initialOutcome,
          initialOutcomeMs,
          firstSolutionPreviewMs,
          warmupRuns: 1,
          measuredRuns: 5,
          preview,
          validation,
          previewP95Ms: p95(preview),
          validationP95Ms: p95(validation),
          scope:
            'Desktop DockerのCDPエミュレーション。追加予算未承認・物理実機未確認。Compilerは各実行で再作成される。',
        },
        null,
        2,
      ),
    );
    await cdp.detach();
  });
}
