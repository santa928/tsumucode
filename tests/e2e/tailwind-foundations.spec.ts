import assert from 'node:assert/strict';
import type { PreviewSnapshot, SnapshotPolicy } from '../../src/core/runtime/contracts';
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
// 複数Fileと専用runtimeを使うProjectは専用specで検査し、ここは基礎3単位を受け持つ。
const exercises = authoring.exercises.filter(
  ({ id }) => id.startsWith('tailwind-ch01-') && id !== 'tailwind-ch01-l01-e01',
);
assert.deepEqual(
  exercises.map(({ id }) => id),
  ['tailwind-ch01-l02-e01', 'tailwind-ch01-l03-e01', 'tailwind-ch01-l04-e01'],
);

test('新規3単位の全Fixtureを固定compiler・全指定幅・状態Styleで判定する', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const harness = new URL('./tailwind-foundation-fixtures.html', testServerUrl(4174)).href;
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
              options: {},
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
    expect(row.status, JSON.stringify(row)).toBe(row.expectedStatus);
    expect(row.failed, row.id).toEqual(row.expectedFailed);
  }
});

for (const exercise of exercises) {
  const lessonId = exercise.id.replace(/-e01$/u, '');
  test(`${lessonId}の通常UIで保存・再読込・判定・Resetと実操作を確認する`, async ({
    page,
  }, info) => {
    // 保存・再読込・a11y・Resetまでを含むため、複数操作全体の時間を確保する。
    test.setTimeout(90_000);
    await page.goto(`${base}#/courses/tailwind/lessons/${lessonId}/exercises/${exercise.id}`);
    const grade = page.getByRole('button', { name: '判定する', exact: true });
    await expect(grade).toBeEnabled();
    const solution = exercise.solutionFiles[0]!.content;
    await replaceEditorText(page, solution);
    await expect
      .poll(async () => {
        const draft = (await readStoredProgress(page)).drafts.find(
          (d) => d['workspaceId'] === exercise.id,
        );
        return (draft?.['files'] as Record<string, string> | undefined)?.['index.html'];
      })
      .toBe(solution);
    await page.reload();
    await expect(page.locator('.cm-content')).toContainText(
      lessonId.endsWith('l02')
        ? 'max-w-80'
        : lessonId.endsWith('l03')
          ? 'hover:bg-black'
          : 'md:flex-row',
    );
    await expect(grade).toBeEnabled();
    const preview = page.frameLocator('[data-testid="runtime-preview-frame"] iframe');
    if (lessonId.endsWith('l03')) {
      const action = preview.getByRole('button', { name: '保存', exact: true });
      const pending = preview.getByRole('button', { name: '送信準備中', exact: true });
      await expect(action).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await action.hover();
      await expect(action).toHaveCSS('background-color', 'rgb(0, 0, 0)');
      await expect(action).toHaveCSS('color', 'rgb(255, 255, 255)');
      await page.mouse.move(0, 0);
      await expect(action).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      // Firefoxはiframe自体にも一度止まるため、内容へ入る前の停止だけを許容する。
      await page.getByTestId('runtime-preview-scroll').focus();
      await page.keyboard.press('Tab');
      if (!(await action.evaluate((node) => node.matches(':focus')))) {
        await expect(page.locator('[data-testid="runtime-preview-frame"] iframe')).toBeFocused();
        await page.keyboard.press('Tab');
      }
      await expect(action).toBeFocused();
      await expect(action).toHaveCSS('outline-width', '2px');
      await expect(action).toHaveCSS('outline-style', 'solid');
      await expect(action).toHaveCSS('outline-offset', '2px');
      await expect(action).toHaveCSS('outline-color', 'rgb(0, 0, 0)');
      await expect(pending).toBeDisabled();
      await expect(pending).toHaveCSS('opacity', '0.5');
      await page.screenshot({ path: info.outputPath('keyboard-focus.png'), fullPage: true });
      await page.keyboard.press('Tab');
      await expect(pending).not.toBeFocused();
      await expect(page.getByRole('button', { name: '説明を見直す', exact: true })).toBeFocused();
      // 判定前に実focusを外し、通常状態と検証用状態を混ぜない。
      await grade.focus();
    }
    if (lessonId.endsWith('l03')) {
      await preview.getByRole('button', { name: '保存', exact: true }).hover();
      await page.keyboard.press('Enter');
    } else {
      await grade.click();
    }
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'できました', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    if (lessonId.endsWith('l03')) {
      const action = preview.getByRole('button', { name: '保存', exact: true });
      await action.hover();
      await expect(action).toHaveCSS('background-color', 'rgb(0, 0, 0)');
      await grade.focus();
      await action.hover();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: 'できました', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: '閉じる', exact: true }).click();
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${lessonId}-solution.png`), fullPage: true });
    await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await page
      .getByRole('dialog', { name: '最初のコードに戻しますか？' })
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expect
      .poll(async () => {
        const draft = (await readStoredProgress(page)).drafts.find(
          (d) => d['workspaceId'] === exercise.id,
        );
        return (draft?.['files'] as Record<string, string> | undefined)?.['index.html'];
      })
      .toBe(exercise.files[0]!.content);
  });
}

for (const narrow of [false, true]) {
  test(`${narrow ? '390px' : 'PC'}で新規8Slideの対応図・a11y・末尾到達を確認する`, async ({
    page,
  }, info) => {
    // 8画面それぞれのa11y検査と画像保存に必要な時間を確保する。
    test.setTimeout(60_000);
    await page.setViewportSize(narrow ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    for (const lesson of authoring.runtime.phases[0]!.chapters[0]!.lessons.slice(1)) {
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
    }
  });
}

test('旧revisionの導入下書きと既読進捗を追加教材への移行で保つ', async ({ page }) => {
  const lessonId = 'tailwind-ch01-l01';
  const exercise = authoring.exercises[0]!;
  await page.goto(`${base}#/courses/tailwind/lessons/${lessonId}/slides/${lessonId}-s01`);
  await expect(page.getByTestId('slide-stage')).toBeVisible();
  await page.goto(`${base}#/courses/tailwind/lessons/${lessonId}/exercises/${exercise.id}`);
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const source =
    exercise.files[0]!.content.replace('横並びのカード', '保存済み下書き129') +
    '\n<!-- 保存済み下書き129 -->\n';
  await replaceEditorText(page, source);
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (d) => d['workspaceId'] === exercise.id,
      );
      return (draft?.['files'] as Record<string, string> | undefined)?.['index.html'];
    })
    .toBe(source);
  await page.evaluate(
    async ({ exerciseId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('tsumucode-progress');
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(new Error('Databaseを開けません', { cause: request.error }));
        };
      });
      try {
        const tx = db.transaction(['drafts', 'courses'], 'readwrite');
        for (const [store, key] of [
          ['drafts', `tailwind:${exerciseId}`],
          ['courses', 'tailwind'],
        ] as const) {
          const request = tx.objectStore(store).get(key);
          request.onsuccess = () => {
            if (!request.result) {
              tx.abort();
              return;
            }
            tx.objectStore(store).put({ ...request.result, contentRevision: '2026-10-14.1' });
          };
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => {
            resolve();
          };
          tx.onabort = () => {
            reject(new Error('旧revision準備失敗', { cause: tx.error }));
          };
          tx.onerror = () => {
            reject(new Error('Database保存失敗', { cause: tx.error }));
          };
        });
      } finally {
        db.close();
      }
    },
    { exerciseId: exercise.id },
  );
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('保存済み下書き129');
  await expect
    .poll(async () => {
      const stored = await readStoredProgress(page);
      const draft = stored.drafts.find((d) => d['workspaceId'] === exercise.id);
      const course = stored.courses.find((c) => c['courseId'] === 'tailwind');
      return {
        source: (draft?.['files'] as Record<string, string> | undefined)?.['index.html'],
        draftRevision: draft?.['contentRevision'],
        courseRevision: course?.['contentRevision'],
        viewed: (
          (course?.['lessons'] as Record<string, { viewedSlideIds: string[] }> | undefined)?.[
            lessonId
          ]?.viewedSlideIds ?? []
        ).includes(`${lessonId}-s01`),
      };
    })
    .toEqual({
      source,
      draftRevision: authoring.runtime.revision,
      courseRevision: authoring.runtime.revision,
      viewed: true,
    });
});

interface StateProbeWindow extends Window {
  __tailwindStateProbe?: {
    readonly runner: InstanceType<typeof RunnerModule.TailwindRunnerAdapter>;
    readonly frame: HTMLIFrameElement;
    readonly policy: SnapshotPolicy;
  };
}

test('実hoverと実focusを残した連続Snapshotを分離し、観測後の表示を復元する', async ({ page }) => {
  const stateExercise = exercises[1]!;
  const harness = new URL('./tailwind-state-probe.html', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>状態復元</title>' }),
  );
  await page.goto(harness);
  await page.evaluate(async (exercise) => {
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
    const runner = new TailwindRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    await runner.prepare(frame);
    const rendered = await runner.render({
      languageId: 'tailwind',
      exerciseSessionId: 'state-probe',
      executionRevision: 1,
      files: Object.fromEntries(exercise.solutionFiles.map((f) => [f.path, f.content])),
      assets: [],
      viewport: exercise.previewViewports[0]!,
      options: {},
    });
    if (rendered.diagnostics.some((d) => d.severity === 'error'))
      throw new Error('状態Probeの描画失敗');
    (window as StateProbeWindow).__tailwindStateProbe = {
      runner,
      frame,
      policy: new ValidatorRuleEngine().buildSnapshotPolicy(exercise.validationRules),
    };
  }, stateExercise);
  const action = page.frameLocator('iframe').getByRole('button', { name: '保存', exact: true });
  try {
    await action.focus();
    await action.hover();
    await expect(action).toBeFocused();
    for (let index = 0; index < 2; index++) {
      const node = await page.evaluate(async () => {
        const probe = (window as StateProbeWindow).__tailwindStateProbe!;
        const snapshot = await probe.runner.requestSnapshot({
          exerciseSessionId: 'state-probe',
          executionRevision: 1,
          requestId: crypto.randomUUID(),
          policy: probe.policy,
        });
        return snapshot.nodes.find((node) => node.matchedSelectors.includes('#action'));
      });
      expect(node?.computedStyles).toMatchObject({
        'background-color': 'rgb(255, 255, 255)',
        color: 'rgb(0, 0, 0)',
        'outline-style': 'none',
      });
      expect(node?.hoverComputedStyles).toMatchObject({
        'background-color': 'rgb(0, 0, 0)',
        color: 'rgb(255, 255, 255)',
      });
      expect(node?.focusVisibleComputedStyles).toMatchObject({
        'outline-width': '2px',
        'outline-style': 'solid',
        'outline-offset': '2px',
      });
      await expect(action).toBeFocused();
      await expect(action).toHaveCSS('background-color', 'rgb(0, 0, 0)');
      await expect(action).toHaveCSS('outline-style', 'solid');
      const attributes = await action.evaluate((element) => element.getAttributeNames());
      expect(attributes.some((name) => name.startsWith('data-tsumucode-'))).toBe(false);
    }
    await page.mouse.move(0, 0);
    await expect(action).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  } finally {
    await page.evaluate(async () => {
      const probe = (window as StateProbeWindow).__tailwindStateProbe;
      await probe?.runner.dispose();
      probe?.frame.remove();
      delete (window as StateProbeWindow).__tailwindStateProbe;
    });
  }
});
