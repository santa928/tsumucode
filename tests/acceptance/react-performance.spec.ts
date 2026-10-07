import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  hashDirectory,
  hashFile,
  calculateArtifactHashes,
} from '../../scripts/release/releaseHashes';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type CDPSession } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { readStoredProgress, waitForDraftSaved } from '../e2e/helpers/progress';
import { testServerUrl } from '../e2e/helpers/testBasePath';

const { exercises } = await loadAuthoringCourse('content/react');
const execFileAsync = promisify(execFile);
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

/** nearest-rank p95。エミュレーションの観測を物理端末の保証へ拡張しない。 */
function p95(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const value = ordered[Math.ceil(ordered.length * 0.95) - 1];
  if (value === undefined) throw new Error('測定値が必要です');
  return value;
}

/** キャッシュなしの新規Contextと暖機Contextへ同じCPU/回線条件を適用する。 */
async function throttle(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
  });
  return cdp;
}

/** Starterの正しい初回結果（型診断または描画）まで待つ。 */
async function initialOutcome(page: Page, id: string): Promise<void> {
  const root = page.frameLocator('iframe[title="Reactコードのプレビュー"]').locator('#root > *');
  if (id === 'react-ch01-l01-e01') {
    await expect(page.getByRole('list', { name: 'コード診断' })).toContainText(
      "Type 'number' is not assignable to type 'string'.",
      { timeout: 60_000 },
    );
    await expect(root).toHaveCount(0);
  } else {
    await expect(root.first()).toBeVisible({ timeout: 60_000 });
  }
}

for (const id of representatives) {
  test(`${id}のCPU4x/低速回線で初回20回と暖機後20回を記録する`, async ({ page, browser }, info) => {
    test.skip(info.project.name !== 'chromium', 'CDPのCPU/回線エミュレーションを明示する。');
    test.setTimeout(1_500_000);
    const exercise = exercises.find((exercise) => exercise.id === id);
    if (!exercise) throw new Error('代表Exerciseがありません');
    const lesson = id.replace(/-e\d+$/u, '');
    const url = `${testServerUrl()}#/courses/react/lessons/${lesson}/exercises/${id}`;
    // 計測開始時にSource/Artifactを取得し、後から現Sourceを貼った旧rawを拒否できるようにする。
    const captureBinding = {
      sourceCommit: (await execFileAsync('git', ['rev-parse', 'HEAD'])).stdout.trim(),
      canonicalDistSha256: (await calculateArtifactHashes(process.cwd(), 'dist', 'react'))
        .artifactDigest,
      applicationSourceSha256: await hashDirectory('src'),
      dependencyLockSha256: await hashFile('package-lock.json'),
      harnessSha256: await hashFile('tests/acceptance/react-performance.spec.ts'),
      workloadSourceSha256: await hashDirectory(
        `content/react/chapters/${lesson.slice(0, -4)}/lessons/${lesson}/exercises/${id}`,
      ),
    };
    const cold: { elapsedMs: number; status: 'pass' | 'fail'; error?: string }[] = [];
    const preview: number[] = [],
      validation: number[] = [];
    const failures: { phase: string; index: number; error: string }[] = [];
    const evidencePath = info.outputPath('react-performance-observation.json');
    const save = async (): Promise<void> => {
      await writeFile(
        evidencePath,
        JSON.stringify(
          {
            captureBinding,
            exerciseId: id,
            browser: browser.version(),
            viewport: page.viewportSize(),
            cpuSlowdown: 4,
            rttMs: 150,
            downloadBitsPerSecond: 1_600_000,
            uploadBitsPerSecond: 750_000,
            cache: 'HTTP cache disabled; cold Context/IndexedDB fresh; warm same Context',
            initialOutcome: id === 'react-ch01-l01-e01' ? 'type-error' : 'rendered',
            cold,
            preview,
            validation,
            failures,
            warmupRuns: 1,
            plannedRuns: 20,
            coldP95Ms: cold.length ? p95(cold.map(({ elapsedMs }) => elapsedMs)) : null,
            coldMaxMs: cold.length ? Math.max(...cold.map(({ elapsedMs }) => elapsedMs)) : null,
            previewP95Ms: preview.length ? p95(preview) : null,
            validationP95Ms: validation.length ? p95(validation) : null,
            scope:
              'Desktop Docker CDP。物理実機・実人は未確認。初回はnavigationからStarter結果、操作はController完了まで。Compilerは各実行で再作成。失敗とtimeoutを保持する。',
          },
          null,
          2,
        ),
      );
    };
    for (let index = 0; index < 20; index += 1) {
      const context = await browser.newContext({ viewport: page.viewportSize() });
      const coldPage = await context.newPage();
      await throttle(coldPage);
      const started = Date.now();
      try {
        await coldPage.goto(url);
        await initialOutcome(coldPage, id);
        cold.push({ elapsedMs: Date.now() - started, status: 'pass' });
      } catch (error) {
        cold.push({ elapsedMs: Date.now() - started, status: 'fail', error: String(error) });
        failures.push({ phase: 'cold', index, error: String(error) });
      } finally {
        await context.close();
        await save();
      }
    }
    const cdp = await throttle(page);
    await page.goto(url);
    await initialOutcome(page, id);
    const root = page.frameLocator('iframe[title="Reactコードのプレビュー"]').locator('#root > *');
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
    await measure(page, 'プレビューを更新', 'tsumucode:preview-update');
    await expect(root.first()).toBeVisible({ timeout: 60000 });
    for (let index = 0; index < 21; index += 1) {
      try {
        const previewMs = await measure(page, 'プレビューを更新', 'tsumucode:preview-update');
        await expect(root.first()).toBeVisible();
        const validationMs = await measure(page, '判定する', 'tsumucode:validation');
        await expect
          .poll(async () => {
            const draft = (await readStoredProgress(page)).drafts.find(
              (row) => row['workspaceId'] === exercise.workspaceId,
            );
            return (draft?.['validationHistory'] as { status: string }[] | undefined)?.at(-1)
              ?.status;
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
      } catch (error) {
        failures.push({ phase: 'warm', index, error: String(error) });
        await save();
        throw error;
      }
      await save();
    }
    await save();
    await cdp.detach();
    expect(failures).toEqual([]);
    expect(cold).toHaveLength(20);
    expect(preview).toHaveLength(20);
    expect(validation).toHaveLength(20);
    expect(Math.max(...cold.map(({ elapsedMs }) => elapsedMs))).toBeLessThanOrEqual(10_000);
    expect(p95(preview)).toBeLessThanOrEqual(2_000);
    expect(p95(validation)).toBeLessThanOrEqual(10_000);
  });
}
