import { expect, test, type Page } from '@playwright/test';
import type { JavaScriptRunnerAdapter as JavaScriptRunnerAdapterType } from '../../src/adapters/runtime/javascript';
import {
  JAVASCRIPT_EXERCISE_ID,
  openEditableJavaScriptExercise,
} from '../e2e/helpers/javascriptCourse';
import { loadJavaScriptRunnerModulePath } from '../e2e/helpers/javascriptRunnerModule';
import { replaceEditorText } from '../e2e/helpers/progress';
import { loadJavaScriptPerformanceManifest, percentile95 } from './manifest';

const manifest = await loadJavaScriptPerformanceManifest();

/** 最新の指定Performance Measureを有限durationとして読む。 */
async function latestMeasure(page: Page, name: string): Promise<number> {
  return page.evaluate((measureName) => {
    const duration = performance.getEntriesByName(measureName).at(-1)?.duration;
    if (duration === undefined || !Number.isFinite(duration)) {
      throw new Error(`Performance Measureがありません: ${measureName}`);
    }
    return duration;
  }, name);
}

/** 指定Measureを空にし、次の実操作1回だけを採取できる状態へ戻す。 */
async function clearMeasures(page: Page): Promise<void> {
  await page.evaluate(() => {
    performance.clearMeasures('tsumucode:preview-update');
    performance.clearMeasures('tsumucode:validation');
  });
}

/** 同一PageでExerciseを開き直す前に、前Sessionの永続Workspace Lease解放を待つ。 */
async function releaseJavaScriptWorkspaceLease(page: Page): Promise<void> {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('tsumucode-progress');
            request.onsuccess = () => {
              resolve(request.result);
            };
            request.onerror = () => {
              reject(request.error ?? new Error('IndexedDB open failed'));
            };
          });
          try {
            if (!database.objectStoreNames.contains('metadata')) return true;
            const transaction = database.transaction('metadata', 'readonly');
            const result = await new Promise<unknown>((resolve, reject) => {
              const request = transaction
                .objectStore('metadata')
                .get('workspaceLease:["javascript","javascript-ch00-l01-e01"]');
              request.onsuccess = () => {
                resolve(request.result);
              };
              request.onerror = () => {
                reject(request.error ?? new Error('Lease read failed'));
              };
            });
            return result === undefined;
          } finally {
            database.close();
          }
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

test('JavaScript初回Previewのp95を500ms以内に保つ', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  expect(manifest.exercises).toEqual([{ id: JAVASCRIPT_EXERCISE_ID, category: 'simple' }]);
  const initialPreviewDurations: number[] = [];
  const totalRuns = manifest.warmupRuns + manifest.runsPerExercise;

  for (let index = 0; index < totalRuns; index += 1) {
    await releaseJavaScriptWorkspaceLease(page);
    await openEditableJavaScriptExercise(page);
    await expect
      .poll(() =>
        page.evaluate(() => performance.getEntriesByName('tsumucode:preview-update').length),
      )
      .toBeGreaterThan(0);
    if (index >= manifest.warmupRuns) {
      initialPreviewDurations.push(await latestMeasure(page, 'tsumucode:preview-update'));
    }
  }

  const result = {
    exerciseId: JAVASCRIPT_EXERCISE_ID,
    initialPreviewP95Ms: percentile95(initialPreviewDurations),
    initialPreviewDurations,
  };
  await testInfo.attach(`${JAVASCRIPT_EXERCISE_ID}-initial-preview-performance.json`, {
    body: Buffer.from(JSON.stringify(result, undefined, 2)),
    contentType: 'application/json',
  });
  expect(result.initialPreviewP95Ms).toBeLessThanOrEqual(manifest.previewP95Ms);
});

test('JavaScript再Previewと判定のp95を性能予算内に保つ', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const repeatPreviewDurations: number[] = [];
  const validationDurations: number[] = [];
  const totalRuns = manifest.warmupRuns + manifest.runsPerExercise;

  await openEditableJavaScriptExercise(page);
  for (let index = 0; index < totalRuns; index += 1) {
    await clearMeasures(page);
    const previewButton = page.getByRole('button', { name: 'プレビューを更新' });
    await previewButton.click();
    await expect
      .poll(() =>
        page.evaluate(() => performance.getEntriesByName('tsumucode:preview-update').length),
      )
      .toBe(1);
    await expect(previewButton).toBeEnabled();

    const validationButton = page.getByRole('button', { name: '判定する' });
    await validationButton.click();
    await expect
      .poll(() => page.evaluate(() => performance.getEntriesByName('tsumucode:validation').length))
      .toBe(1);
    await expect(validationButton).toBeEnabled();

    if (index >= manifest.warmupRuns) {
      repeatPreviewDurations.push(await latestMeasure(page, 'tsumucode:preview-update'));
      validationDurations.push(await latestMeasure(page, 'tsumucode:validation'));
    }

    const feedback = page.getByRole('dialog', { name: '判定結果' });
    await expect(feedback).toBeVisible();
    await feedback.getByRole('button', { name: '閉じる' }).click();
    await expect(feedback).toBeHidden();
  }

  const result = {
    exerciseId: JAVASCRIPT_EXERCISE_ID,
    repeatPreviewP95Ms: percentile95(repeatPreviewDurations),
    validationP95Ms: percentile95(validationDurations),
    repeatPreviewDurations,
    validationDurations,
  };
  await testInfo.attach(`${JAVASCRIPT_EXERCISE_ID}-repeat-performance.json`, {
    body: Buffer.from(JSON.stringify(result, undefined, 2)),
    contentType: 'application/json',
  });

  expect(result.repeatPreviewP95Ms).toBeLessThanOrEqual(manifest.repeatPreviewP95Ms);
  expect(result.validationP95Ms).toBeLessThanOrEqual(manifest.validationP95Ms);
});

test('標準20 ScenarioとGuided相当4 Scenarioを性能予算内に保つ', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('./#/');
  const runnerModulePath = await loadJavaScriptRunnerModulePath();
  const result = await page.evaluate<
    {
      readonly standardDurations: readonly number[];
      readonly guidedBatchDuration: number;
    },
    {
      readonly runnerModulePath: string;
      readonly warmupRuns: number;
      readonly standardRuns: number;
    }
  >(
    async ({ runnerModulePath, warmupRuns, standardRuns }) => {
      const { JavaScriptRunnerAdapter } = (await import(/* @vite-ignore */ runnerModulePath)) as {
        readonly JavaScriptRunnerAdapter: typeof JavaScriptRunnerAdapterType;
      };
      const runner = new JavaScriptRunnerAdapter();
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.inset = '0';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      document.body.append(frame);
      await runner.prepare(frame);
      const exerciseSessionId = crypto.randomUUID();
      let executionRevision = 0;
      let requestSequence = 0;
      const policy = {
        selectors: ['#score'],
        attributes: [],
        computedStyles: [],
        focusVisibleSelectors: [],
        focusVisibleComputedStyles: [],
        includeAllElements: false,
      } as const;
      const runScenario = async (actionCount: number): Promise<number> => {
        const startedAt = performance.now();
        executionRevision += 1;
        const rendered = await runner.render({
          exerciseSessionId,
          executionRevision,
          languageId: 'javascript',
          files: {
            'index.html': '<button id="answer" type="button">回答</button><p id="score">0点</p>',
            'styles.css': '',
            'script.js': `let score = 0;
const scoreNode = document.querySelector('#score');
document.querySelector('#answer').addEventListener('click', () => {
  score += 1;
  scoreNode.textContent = score + '点';
});`,
          },
          assets: [],
          viewport: { id: 'desktop', width: 1280, height: 720 },
          options: {
            runtime: {
              kind: 'javascript',
              entryFile: 'script.js',
              sourceType: 'script',
              capabilityProfile: 'dom',
              primaryOutput: 'preview',
            },
          },
        });
        if (rendered.diagnostics.some(({ severity }) => severity === 'error')) {
          throw new Error(JSON.stringify(rendered.diagnostics));
        }
        if (rendered.frameGeneration === undefined) throw new Error('frame generationがありません');
        for (let index = 0; index < actionCount; index += 1) {
          await runner.interact({
            exerciseSessionId,
            executionRevision,
            frameGeneration: rendered.frameGeneration,
            requestId: `interaction-${String(++requestSequence)}`,
            action: { id: `answer-${String(index)}`, kind: 'click', selector: '#answer' },
          });
        }
        const snapshot = await runner.requestSnapshot({
          exerciseSessionId,
          executionRevision,
          requestId: `snapshot-${String(++requestSequence)}`,
          policy,
          preserveTimers: true,
        });
        const score = snapshot.nodes.find(({ matchedSelectors }) =>
          matchedSelectors.includes('#score'),
        )?.text;
        if (score !== `${String(actionCount)}点`)
          throw new Error(`Scenario結果不一致: ${String(score)}`);
        return performance.now() - startedAt;
      };

      try {
        for (let index = 0; index < warmupRuns; index += 1) await runScenario(1);
        const standardDurations: number[] = [];
        for (let index = 0; index < standardRuns; index += 1) {
          standardDurations.push(await runScenario(1));
        }
        const guidedStartedAt = performance.now();
        for (let index = 0; index < 4; index += 1) await runScenario(4);
        return {
          standardDurations,
          guidedBatchDuration: performance.now() - guidedStartedAt,
        };
      } finally {
        await runner.dispose();
        frame.remove();
      }
    },
    {
      runnerModulePath,
      warmupRuns: manifest.warmupRuns,
      standardRuns: manifest.runsPerExercise,
    },
  );
  const evidence = {
    ...result,
    standardScenarioP95Ms: percentile95(result.standardDurations),
  };
  await testInfo.attach('javascript-scenario-performance.json', {
    body: Buffer.from(JSON.stringify(evidence, undefined, 2)),
    contentType: 'application/json',
  });
  expect(result.standardDurations).toHaveLength(20);
  expect(evidence.standardScenarioP95Ms).toBeLessThanOrEqual(manifest.scenarioP95Ms);
  expect(evidence.guidedBatchDuration).toBeLessThanOrEqual(manifest.guidedScenarioBatchMaxMs);
});

test('Console 100件を20回更新して50ms超のlong taskを発生させない', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openEditableJavaScriptExercise(page);
  await replaceEditorText(
    page,
    `for (let index = 0; index < 100; index += 1) console.log(index);
document.querySelector('#message').textContent = 'JavaScriptで文字を変えました';`,
  );
  const update = page.getByRole('button', { name: 'プレビューを更新' });
  await update.click();
  await expect(update).toBeEnabled();
  await page.getByRole('tab', { name: 'Console' }).click();
  await expect(page.getByRole('region', { name: 'Console出力' }).getByRole('listitem')).toHaveCount(
    100,
  );

  const longTaskSupported = await page.evaluate(() =>
    PerformanceObserver.supportedEntryTypes.includes('longtask'),
  );
  expect(longTaskSupported).toBe(true);
  await page.evaluate(() => {
    const durations: number[] = [];
    const observer = new PerformanceObserver((list) => {
      durations.push(...list.getEntries().map(({ duration }) => duration));
    });
    observer.observe({ type: 'longtask', buffered: false });
    Reflect.set(window, '__tcConsoleLongTaskProbe', { durations, observer });
  });

  const updateStatus = page.locator('.tc-runtime-output-card [role="status"]');
  for (let index = 0; index < 20; index += 1) {
    const previousStatus = await updateStatus.textContent();
    await update.click();
    await expect(update).toBeEnabled();
    await expect.poll(() => updateStatus.textContent()).not.toBe(previousStatus);
  }

  const durations = await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    const probe = Reflect.get(window, '__tcConsoleLongTaskProbe') as
      { readonly durations: readonly number[]; readonly observer: PerformanceObserver } | undefined;
    if (probe === undefined) throw new Error('Console long task probeがありません');
    probe.observer.disconnect();
    Reflect.deleteProperty(window, '__tcConsoleLongTaskProbe');
    return [...probe.durations];
  });
  const result = {
    exerciseId: JAVASCRIPT_EXERCISE_ID,
    renderCount: 20,
    consoleRecordCount: 100,
    longTaskThresholdMs: 50,
    longTaskDurations: durations,
  };
  await testInfo.attach(`${JAVASCRIPT_EXERCISE_ID}-console-performance.json`, {
    body: Buffer.from(JSON.stringify(result, undefined, 2)),
    contentType: 'application/json',
  });
  expect(durations.filter((duration) => duration > 50)).toEqual([]);
});
