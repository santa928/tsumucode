import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import type { PreviewSnapshot } from '../../src/core/runtime/contracts';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testBasePath, testServerUrl } from './helpers/testBasePath';
import { replaceEditorText, readStoredProgress } from './helpers/progress';
import { expectSlideScrollReachable } from './helpers/slideScroll';
import type * as RunnerModule from '../../src/adapters/runtime/tailwind/TailwindRunnerAdapter';
import type * as ValidatorModule from '../../src/core/validation/validatorRuleEngine';

const base = testBasePath();
const authoring = await loadAuthoringCourse('content/tailwind');
const exercises = authoring.exercises.filter((exercise) => exercise.id === 'tailwind-ch02-l01-e01');
const project = exercises[0]!;

test('制作課題の全Fixtureを固定compiler・全指定幅・状態Styleで判定する', async ({ page }, info) => {
  test.setTimeout(120_000);
  const harness = new URL('./tailwind-project-fixtures.html', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>基礎Fixture</title>' }),
  );
  await page.goto(harness);
  const rows = await page.evaluate(async (exercises) => {
    const runnerPath = new URL(
      './src/adapters/runtime/tailwind/TailwindRunnerAdapter.ts',
      location.href,
    ).href;
    const validatorPath = new URL('./src/core/validation/validatorRuleEngine.ts', location.href)
      .href;
    const { TailwindRunnerAdapter } = (await import(
      /* @vite-ignore */ runnerPath
    )) as typeof RunnerModule;
    const { ValidatorRuleEngine } = (await import(
      /* @vite-ignore */ validatorPath
    )) as typeof ValidatorModule;
    const validator = new ValidatorRuleEngine();
    const runner = new TailwindRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const observations = [];
    let revision = 0;
    try {
      await runner.prepare(frame);
      for (const exercise of exercises) {
        const policy = validator.buildSnapshotPolicy(exercise.validationRules);
        for (const fixture of exercise.fixtures) {
          revision++;
          const files = Object.fromEntries(fixture.files.map((file) => [file.path, file.content]));
          const snapshots: Record<string, PreviewSnapshot> = {};
          const diagnostics = [];
          for (const viewport of exercise.previewViewports) {
            frame.width = String(viewport.width);
            frame.height = String(viewport.height);
            const rendered = await runner.render({
              languageId: 'tailwind',
              exerciseSessionId: exercise.id,
              executionRevision: revision,
              files,
              assets: [],
              viewport,
              options: { runtime: exercise.runtime },
            });
            diagnostics.push(...rendered.diagnostics);
            const snapshot = await runner.requestSnapshot({
              exerciseSessionId: exercise.id,
              executionRevision: revision,
              requestId: crypto.randomUUID(),
              policy,
            });
            snapshots[viewport.id] = snapshot;
          }
          const result = await validator.validate({
            exerciseId: exercise.id,
            rules: exercise.validationRules,
            files,
            snapshots,
            diagnostics,
            evidence: [],
            console: [],
            interactionScenarios: [],
            interactionCheckpoints: {},
            now: new Date().toISOString(),
          });
          observations.push({
            id: fixture.id,
            status: result.status,
            expectedStatus: fixture.expectedStatus,
            failed: result.checks
              .filter((check) => !check.passed)
              .map((check) => check.ruleId)
              .sort(),
            expectedFailed: [...fixture.expectedFeedbackRuleIds].sort(),
            diagnostics: diagnostics.map((d) => d.code),
          });
        }
      }
      return observations;
    } finally {
      await runner.dispose();
      frame.remove();
    }
  }, exercises);
  await info.attach('全Fixture描画判定', {
    body: JSON.stringify(rows, null, 2),
    contentType: 'application/json',
  });
  for (const row of rows) {
    if (
      [
        'tailwind-project-disabled-control',
        'tailwind-project-unnamed-control',
        'tailwind-project-missing-flex',
      ].includes(row.id)
    ) {
      expect
        .soft(row.status, `操作・配置の未達を合格にしない: ${JSON.stringify(row)}`)
        .toBe('incomplete');
    }
  }
  for (const row of rows) {
    expect(row.status, JSON.stringify(row)).toBe(row.expectedStatus);
    expect(row.failed, row.id).toEqual(row.expectedFailed);
    expect(row.diagnostics, row.id).toEqual([]);
  }
});

test('制作の2ソースを保存・再開し、途中ZIPと実操作・判定・Resetを確認する', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const lessonId = 'tailwind-ch02-l01';
  await page.goto(`${base}#/courses/tailwind/lessons/${lessonId}/exercises/${project.id}`);
  const grade = page.getByRole('button', { name: '判定する', exact: true });
  const exportButton = page.getByRole('button', { name: '制作Sourceを持ち出す', exact: true });
  const starter = Object.fromEntries(project.files.map((file) => [file.path, file.content]));
  const solution = Object.fromEntries(
    project.solutionFiles.map((file) => [file.path, file.content]),
  );
  await expect(grade).toBeEnabled();
  await page.getByRole('tab', { name: 'styles.css', exact: true }).click();
  const partial = starter['styles.css']!.replace('#000000', '#0f3c4c');
  await replaceEditorText(page, partial);
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (row) => row['workspaceId'] === project.id,
      );
      return (draft?.['files'] as Record<string, string> | undefined)?.['styles.css'];
    })
    .toBe(partial);
  await expect(exportButton).toBeEnabled();
  const before = await readStoredProgress(page);
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('tsumucode-tailwind-reading-cards.zip');
  const zipPath = info.outputPath('tailwind-partial.zip');
  await download.saveAs(zipPath);
  const entries = unzipSync(new Uint8Array(await readFile(zipPath)));
  expect(strFromU8(entries['styles.css']!)).toBe(partial);
  expect(strFromU8(entries['index.html']!)).toBe(starter['index.html']);
  expect(Object.keys(entries).sort()).toEqual([
    'README.md',
    'index.html',
    'package-lock.json',
    'package.json',
    'styles.css',
    'vite.config.mjs',
  ]);
  const after = await readStoredProgress(page);
  expect(after.drafts.find((row) => row['workspaceId'] === project.id)?.['files']).toEqual({
    ...starter,
    'styles.css': partial,
  });
  expect(after.courses.find((row) => row['courseId'] === 'tailwind')?.['lessons']).toEqual(
    before.courses.find((row) => row['courseId'] === 'tailwind')?.['lessons'],
  );

  await replaceEditorText(page, solution['styles.css']!);
  await page.getByRole('tab', { name: 'index.html', exact: true }).click();
  await replaceEditorText(page, solution['index.html']!);
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (row) => row['workspaceId'] === project.id,
      );
      return draft?.['files'];
    })
    .toEqual(solution);
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('note-card');
  await expect(page.getByRole('tab', { name: 'index.html', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('region', { name: '演習の手順' }).locator('code')).toHaveText(
    'index.html',
  );
  await page.getByRole('tab', { name: 'styles.css', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('#0f3c4c');
  await expect(grade).toBeEnabled();
  const solutionDownloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const solutionDownload = await solutionDownloadPromise;
  const solutionZipPath = info.outputPath('tailwind-solution.zip');
  await solutionDownload.saveAs(solutionZipPath);
  const solutionEntries = unzipSync(new Uint8Array(await readFile(solutionZipPath)));
  expect(strFromU8(solutionEntries['index.html']!)).toBe(solution['index.html']);
  expect(strFromU8(solutionEntries['styles.css']!)).toBe(solution['styles.css']);
  const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
  await update.click();
  await expect(grade).toBeEnabled();
  const preview = page.frameLocator('[data-testid="runtime-preview-frame"] iframe');
  for (const viewport of project.previewViewports) {
    await page
      .getByRole('combobox', { name: 'プレビューの画面幅', exact: true })
      .selectOption(viewport.id, { timeout: 10_000 });
    await expect
      .poll(() => preview.locator('html').evaluate(() => window.innerWidth))
      .toBe(viewport.width);
    await expect(preview.locator('#cards')).toHaveCSS(
      'flex-direction',
      viewport.width < 768 ? 'column' : 'row',
    );
    await expect(grade).toBeEnabled();
    const first = await preview.locator('#read-card').boundingBox();
    const second = await preview.locator('#make-card').boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (viewport.width < 768) expect(second!.y).toBeGreaterThan(first!.y);
    else expect(second!.x).toBeGreaterThan(first!.x);
  }
  const action = preview.getByRole('button', { name: '操作状態を試す', exact: true });
  await page.getByTestId('runtime-preview-scroll').focus();
  await page.keyboard.press('Tab');
  if (!(await action.evaluate((node) => node.matches(':focus')))) {
    await expect(page.locator('[data-testid="runtime-preview-frame"] iframe')).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(action).toBeFocused();
  await expect(action).toHaveCSS('outline-style', 'solid');
  await expect(action).toHaveCSS('outline-width', '2px');
  await expect(action).toHaveCSS('outline-color', 'rgb(15, 60, 76)');
  await action.hover();
  await expect(action).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await page.screenshot({ path: info.outputPath('project-focus-hover.png'), fullPage: true });
  await grade.focus();
  await action.hover();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(grade).toBeEnabled();
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (row) => row['workspaceId'] === project.id,
      );
      return draft?.['files'];
    })
    .toEqual(starter);
  await expect(grade).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

for (const narrow of [false, true]) {
  test(`${narrow ? '390px' : 'PC'}で制作の3Slideと図・a11y・末尾到達を確認する`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize(narrow ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    const lesson = authoring.runtime.phases[0]!.chapters[1]!.lessons[0]!;
    for (const slide of lesson.slides) {
      await page.goto(`${base}#/courses/tailwind/lessons/${lesson.id}/slides/${slide.id}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage).toHaveAttribute('data-slide-id', slide.id);
      const image = stage.getByRole('img').first();
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectSlideScrollReachable(page, narrow);
      await image.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`${slide.id}.png`), fullPage: true });
    }
  });
}
