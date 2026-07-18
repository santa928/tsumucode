import { expect, test, type Locator, type Page } from '@playwright/test';
import { editorText } from '../e2e/helpers/progress';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  expectStoredViewedSlide,
  openEditableExercise,
} from '../e2e/helpers/releaseCourse';
import { loadPerformanceManifest } from './manifest';

interface InteractionMeasurement {
  readonly name: string;
  readonly routeReadyMs: number;
  readonly eventDurationsMs: readonly number[];
}

const manifest = await loadPerformanceManifest();

/** Script request pathに指定Chunk名が含まれるかを判定する。 */
function includesChunk(paths: readonly string[], chunkName: RegExp): boolean {
  return paths.some((requestPath) => chunkName.test(requestPath));
}

/** click直前から期待UI表示までと、同区間のEvent Timing durationを別々に測る。 */
async function measureInteraction(
  page: Page,
  name: string,
  action: () => Promise<void>,
  ready: Locator,
): Promise<InteractionMeasurement> {
  const startedAt = await page.evaluate(() => performance.now());
  await action();
  await ready.waitFor({ state: 'visible' });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  return page.evaluate(
    ({ interactionName, start }) => {
      const stored = Reflect.get(window, '__tsumucodePerformanceEvents') as unknown;
      const events = Array.isArray(stored)
        ? (stored as readonly { readonly startTime: number; readonly duration: number }[])
        : [];
      return {
        name: interactionName,
        routeReadyMs: performance.now() - start,
        eventDurationsMs: events
          .filter((entry) => entry.startTime >= start)
          .map((entry) => entry.duration),
      };
    },
    { interactionName: name, start: startedAt },
  );
}

test('主要5操作、Event Timing、Draft永続化が予算内に完了する', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    const entries: { startTime: number; duration: number }[] = [];
    Reflect.set(window, '__tsumucodePerformanceEvents', entries);
    const observer = new PerformanceObserver((list) => {
      entries.push(
        ...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })),
      );
    });
    observer.observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit & { readonly durationThreshold: number });
    Reflect.set(window, '__tsumucodePerformanceObserver', observer);
  });

  await page.goto('./#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01');
  await expectStoredViewedSlide(page, STANDARD_LESSON_ID, 'html-css-ch00-l01-s01');
  await page.goto('./#/');
  const continueLink = page.getByRole('link', {
    name: 'HTML/CSS はじめの一歩：つづきから',
  });
  await expect(continueLink).toBeVisible();

  const measurements: InteractionMeasurement[] = [];
  measurements.push(
    await measureInteraction(
      page,
      'home-continue',
      () => continueLink.click(),
      page.getByRole('progressbar', { name: 'スライドの現在位置' }),
    ),
  );

  await page.getByRole('link', { name: '← コースマップへ戻る' }).click();
  const lessonLink = page.getByRole('link', {
    name: 'Webページを作る3つの役割レッスンを始める',
  });
  await expect(lessonLink).toBeVisible();
  measurements.push(
    await measureInteraction(
      page,
      'course-map-lesson',
      () => lessonLink.click(),
      page.getByRole('progressbar', { name: 'スライドの現在位置' }),
    ),
  );

  measurements.push(
    await measureInteraction(
      page,
      'slide-next',
      () => page.getByRole('link', { name: '次のスライドへ →' }).click(),
      page.getByRole('heading', { level: 1, name: 'HTMLは内容と意味を積み上げる' }),
    ),
  );
  await expectStoredViewedSlide(page, STANDARD_LESSON_ID, 'html-css-ch00-l01-s02');
  await page.getByRole('link', { name: '次のスライドへ →' }).click();
  await expectStoredViewedSlide(page, STANDARD_LESSON_ID, 'html-css-ch00-l01-s03');

  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
  measurements.push(
    await measureInteraction(
      page,
      'exercise-validate',
      () => page.getByRole('button', { name: '判定する' }).click(),
      page.getByRole('heading', { name: 'あと一歩' }),
    ),
  );

  await page
    .getByRole('button', { name: /関連スライドを見直す/u })
    .first()
    .click();
  const returnButton = page.getByRole('button', { name: '演習へ戻る' });
  await expect(returnButton).toBeVisible();
  measurements.push(
    await measureInteraction(
      page,
      'review-return',
      () => returnButton.click(),
      page.getByTestId('code-workspace'),
    ),
  );

  await page.evaluate(() => {
    performance.clearMeasures('tsumucode:draft-persist');
  });
  const editor = page.locator('.cm-content');
  const editorSourceBeforeEdit = await editorText(page);
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' ');
  await expect.poll(() => editorText(page)).not.toBe(editorSourceBeforeEdit);
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByName('tsumucode:draft-persist').length))
    .toBe(1);
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
  const draftPersistenceMs = await page.evaluate(() => {
    const duration = performance.getEntriesByName('tsumucode:draft-persist').at(-1)?.duration;
    if (duration === undefined) throw new Error('Draft persistence measureがありません');
    return duration;
  });

  await testInfo.attach('interaction-performance.json', {
    body: Buffer.from(JSON.stringify({ measurements, draftPersistenceMs }, undefined, 2)),
    contentType: 'application/json',
  });

  for (const measurement of measurements) {
    expect(measurement.routeReadyMs, measurement.name).toBeLessThanOrEqual(
      manifest.webVitals.interactionMaxMs,
    );
    expect(
      measurement.eventDurationsMs.length,
      `${measurement.name} PerformanceEventTiming件数`,
    ).toBeGreaterThan(0);
    for (const duration of measurement.eventDurationsMs) {
      expect(duration, `${measurement.name} Event Timing`).toBeLessThanOrEqual(
        manifest.webVitals.interactionMaxMs,
      );
    }
  }
  expect(draftPersistenceMs).toBeLessThanOrEqual(manifest.draftPersistenceMaxMs);
});

test('EditorとHTML/CSS RunnerはExercise routeでだけ遅延取得する', async ({ page }) => {
  const scriptPaths = new Set<string>();
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptPaths.add(new URL(request.url()).pathname);
  });

  await page.goto('./#/');
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  const homeScripts = [...scriptPaths];
  expect(includesChunk(homeScripts, /CodeWorkspace|EditableExercisePage|html-css-/u)).toBe(false);

  scriptPaths.clear();
  await page.goto('./#/courses/html-css/lessons/html-css-ch01-l01/slides/html-css-ch01-l01-s01');
  await expect(page.getByRole('progressbar', { name: 'スライドの現在位置' })).toBeVisible();
  const slideScripts = [...scriptPaths];
  expect(includesChunk(slideScripts, /CodeWorkspace|EditableExercisePage|html-css-/u)).toBe(false);

  scriptPaths.clear();
  await page.goto('./#/courses/html-css/lessons/html-css-ch01-l01/exercises/html-css-ch01-l01-e01');
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  const exerciseScripts = [...scriptPaths];
  expect(includesChunk(exerciseScripts, /EditableExercisePage-/u), exerciseScripts.join('\n')).toBe(
    true,
  );
  expect(includesChunk(exerciseScripts, /CodeWorkspace-/u), exerciseScripts.join('\n')).toBe(true);
  expect(includesChunk(exerciseScripts, /html-css-/u), exerciseScripts.join('\n')).toBe(true);
});
