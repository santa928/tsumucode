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

interface InteractionReadyProbe {
  readonly selector: string;
  readonly exactText?: string;
}

const manifest = await loadPerformanceManifest();

/** Script request pathに指定Chunk名が含まれるかを判定する。 */
function includesChunk(paths: readonly string[], chunkName: RegExp): boolean {
  return paths.some((requestPath) => chunkName.test(requestPath));
}

/** 実click生成時刻から期待UI表示までと、同区間のEvent Timing durationを別々に測る。 */
async function measureInteraction(
  page: Page,
  name: string,
  action: () => Promise<void>,
  ready: Locator,
  readyProbe: InteractionReadyProbe,
): Promise<InteractionMeasurement> {
  await page.evaluate(
    ({ interactionName, probe }) => {
      const normalizedExpectedText = probe.exactText?.replace(/\s+/gu, ' ').trim();
      const isReady = (): boolean =>
        [...document.querySelectorAll(probe.selector)].some((element) => {
          const textMatches =
            normalizedExpectedText === undefined ||
            element.textContent.replace(/\s+/gu, ' ').trim() === normalizedExpectedText;
          if (!textMatches) return false;
          const style = getComputedStyle(element);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            element.getClientRects().length > 0
          );
        });
      if (isReady()) {
        throw new Error(`${interactionName}のready probeがclick前から成立しています`);
      }

      Reflect.set(window, '__tsumucodeInteractionStartedAt', undefined);
      Reflect.set(
        window,
        '__tsumucodeInteractionReadyAt',
        new Promise<number>((resolve) => {
          const check = (): void => {
            if (!isReady()) {
              requestAnimationFrame(check);
              return;
            }
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                resolve(performance.now());
              });
            });
          };
          requestAnimationFrame(check);
        }),
      );
      window.addEventListener(
        'click',
        (event) => {
          Reflect.set(window, '__tsumucodeInteractionStartedAt', event.timeStamp);
        },
        { capture: true, once: true },
      );
    },
    { interactionName: name, probe: readyProbe },
  );
  await action();
  const measurement = await page.evaluate(
    ({ interactionName }) => {
      const readyAtPromise = Reflect.get(window, '__tsumucodeInteractionReadyAt') as unknown;
      if (!(readyAtPromise instanceof Promise)) {
        throw new Error(`${interactionName}のready probeを取得できませんでした`);
      }
      return readyAtPromise.then((readyAt: number) => {
        const start = Reflect.get(window, '__tsumucodeInteractionStartedAt') as unknown;
        if (typeof start !== 'number' || !Number.isFinite(start)) {
          throw new Error(`${interactionName}のclick生成時刻を取得できませんでした`);
        }
        const stored = Reflect.get(window, '__tsumucodePerformanceEvents') as unknown;
        const events = Array.isArray(stored)
          ? (stored as { startTime: number; duration: number }[])
          : [];
        const observer = Reflect.get(window, '__tsumucodePerformanceObserver') as unknown;
        if (observer instanceof PerformanceObserver) {
          events.push(
            ...observer.takeRecords().map(({ startTime, duration }) => ({ startTime, duration })),
          );
        }
        return {
          name: interactionName,
          routeReadyMs: readyAt - start,
          eventDurationsMs: events
            .filter((entry) => entry.startTime >= start - 1 && entry.startTime <= readyAt)
            .map((entry) => entry.duration),
        };
      });
    },
    { interactionName: name },
  );
  await ready.waitFor({ state: 'visible' });
  return measurement;
}

test('Playwrightからclickを配信する前の待機はユーザー操作時間へ含めない', async ({ page }) => {
  await page.setContent('<button type="button">画面を開く</button><p hidden>準備完了</p>');
  await page.getByRole('button', { name: '画面を開く' }).evaluate((button) => {
    button.addEventListener('click', () => {
      document.querySelector('p')?.removeAttribute('hidden');
    });
  });

  const measurement = await measureInteraction(
    page,
    'driver-dispatch-latency',
    async () => {
      await page.evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 250)));
      await page.getByRole('button', { name: '画面を開く' }).click();
    },
    page.getByText('準備完了'),
    { selector: 'p', exactText: '準備完了' },
  );

  expect(measurement.routeReadyMs).toBeLessThanOrEqual(manifest.webVitals.interactionMaxMs);
});

test('Event Timing APIは16ms以上の制御済みclickを観測する', async ({ page }) => {
  await page.setContent('<button type="button">計測する</button>');
  await page.getByRole('button', { name: '計測する' }).evaluate((button) => {
    if (!PerformanceObserver.supportedEntryTypes.includes('event')) {
      throw new Error('Event Timing APIがサポートされていません');
    }
    const measured = new Promise<number>((resolve, reject) => {
      const observer = new PerformanceObserver((list) => {
        const click = list.getEntries().find((entry) => entry.name === 'click');
        if (click === undefined) return;
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(click.duration);
      });
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error('制御済みclickのPerformanceEventTimingを取得できませんでした'));
      }, 2_000);
      observer.observe({
        type: 'event',
        durationThreshold: 16,
      } as PerformanceObserverInit & { readonly durationThreshold: number });
    });
    Reflect.set(window, '__tsumucodeControlledEventTiming', measured);
    button.addEventListener('click', () => {
      const busyUntil = performance.now() + 24;
      let spins = 0;
      while (performance.now() < busyUntil) spins += 1;
      Reflect.set(window, '__tsumucodeControlledEventTimingSpins', spins);
    });
  });

  await page.getByRole('button', { name: '計測する' }).click();
  const duration = await page.evaluate(() => {
    const measured = Reflect.get(window, '__tsumucodeControlledEventTiming') as unknown;
    if (!(measured instanceof Promise)) throw new Error('Event Timing計測Promiseがありません');
    return measured as Promise<number>;
  });

  expect(duration).toBeGreaterThanOrEqual(16);
  expect(duration).toBeLessThanOrEqual(manifest.webVitals.interactionMaxMs);
});

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
      { selector: 'progress[aria-label="スライドの現在位置"]' },
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
      { selector: 'progress[aria-label="スライドの現在位置"]' },
    ),
  );

  measurements.push(
    await measureInteraction(
      page,
      'slide-next',
      () => page.getByRole('link', { name: '次のスライドへ →' }).click(),
      page.getByRole('heading', { level: 1, name: 'HTMLは内容と意味を積み上げる' }),
      { selector: 'main h1', exactText: 'HTMLは内容と意味を積み上げる' },
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
      { selector: '[data-testid="validation-feedback"] h2', exactText: 'あと一歩' },
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
      { selector: '[data-testid="code-workspace"]' },
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
