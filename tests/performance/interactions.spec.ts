import { expect, test, type Locator, type Page } from '@playwright/test';
import { editorText, readStoredProgress } from '../e2e/helpers/progress';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  expectStoredViewedSlide,
  openEditableExercise,
  readExerciseStarter,
} from '../e2e/helpers/releaseCourse';
import { loadPerformanceManifest, percentile95 } from './manifest';

interface InteractionMeasurement {
  readonly name: string;
  readonly routeReadyMs: number;
  readonly eventDurationsMs: readonly number[];
}

interface InteractionReadyProbe {
  readonly selector: string;
  readonly exactText?: string;
}

interface RafFencedClickMeasurement {
  readonly name: string;
  readonly durationMs: number;
}

interface ReadyPageClickMeasurement {
  readonly name: string;
  readonly readyDurationMs: number;
  readonly rafFenceDurationMs: number;
  readonly longTaskDurationsMs: readonly number[];
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
              resolve(performance.now());
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

/** 実clickからready表示までを測り、2 RAF fenceまでのLong Taskも収集する。 */
async function measureReadyPageClick(
  page: Page,
  name: string,
  action: () => Promise<void>,
  ready: Locator,
  readyProbe: InteractionReadyProbe,
): Promise<ReadyPageClickMeasurement> {
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

      const measured = new Promise<{
        readonly readyDurationMs: number;
        readonly rafFenceDurationMs: number;
        readonly longTaskDurationsMs: readonly number[];
      }>((resolve) => {
        if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) {
          throw new Error(`${interactionName}のLong Task計測をこのBrowserはサポートしていません`);
        }

        const longTasks: { readonly startTime: number; readonly duration: number }[] = [];
        const longTaskObserver = new PerformanceObserver((list) => {
          longTasks.push(
            ...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })),
          );
        });
        longTaskObserver.observe({ type: 'longtask' });

        let startedAt: number | undefined;
        let readyAt: number | undefined;
        function markReady(): void {
          const started = startedAt;
          if (started === undefined || readyAt !== undefined || !isReady()) return;
          const resolvedReadyAt = performance.now();
          readyAt = resolvedReadyAt;
          observer.disconnect();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const rafFenceAt = performance.now();
              setTimeout(() => {
                longTasks.push(
                  ...longTaskObserver
                    .takeRecords()
                    .map(({ startTime, duration }) => ({ startTime, duration })),
                );
                longTaskObserver.disconnect();
                resolve({
                  readyDurationMs: resolvedReadyAt - started,
                  rafFenceDurationMs: rafFenceAt - started,
                  longTaskDurationsMs: longTasks
                    .filter(
                      ({ startTime, duration }) =>
                        startTime <= rafFenceAt && startTime + duration >= started,
                    )
                    .map(({ duration }) => duration),
                });
              }, 0);
            });
          });
        }

        const observer = new MutationObserver(markReady);
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'hidden', 'open', 'style'],
          childList: true,
          subtree: true,
        });
        window.addEventListener(
          'click',
          (event) => {
            startedAt = event.timeStamp;
            queueMicrotask(markReady);
          },
          { capture: true, once: true },
        );
      });
      Reflect.set(window, '__tsumucodeReadyPageClick', measured);
    },
    { interactionName: name, probe: readyProbe },
  );

  await action();
  const measurement = await page.evaluate((interactionName) => {
    const measured = Reflect.get(window, '__tsumucodeReadyPageClick') as unknown;
    if (!(measured instanceof Promise)) {
      throw new Error(`${interactionName}のready計測Promiseを取得できませんでした`);
    }
    return measured as Promise<{
      readonly readyDurationMs: number;
      readonly rafFenceDurationMs: number;
      readonly longTaskDurationsMs: readonly number[];
    }>;
  }, name);
  await ready.waitFor({ state: 'visible' });
  return { name, ...measurement };
}

/** 実click生成時刻からopaque iframe内のready表示後、2 RAF fenceまでを測る。 */
async function measureRafFencedPreviewClick(
  page: Page,
  name: string,
  action: () => Promise<void>,
  ready: Locator,
  readyProbe: InteractionReadyProbe,
): Promise<RafFencedClickMeasurement> {
  const frameHandle = await page.locator('iframe[title="コードのプレビュー"]').elementHandle();
  const previewFrame = await frameHandle?.contentFrame();
  if (previewFrame === null || previewFrame === undefined) {
    throw new Error(`${name}のPreview frameを取得できませんでした`);
  }
  const readyInitially = await previewFrame.evaluate((probe) => {
    const normalizedExpectedText = probe.exactText?.replace(/\s+/gu, ' ').trim();
    return [...document.querySelectorAll(probe.selector)].some((element) => {
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
  }, readyProbe);
  if (readyInitially) throw new Error(`${name}のready probeがclick前から成立しています`);

  const readyHandle = previewFrame.waitForFunction(
    (probe) => {
      const normalizedExpectedText = probe.exactText?.replace(/\s+/gu, ' ').trim();
      return [...document.querySelectorAll(probe.selector)].some((element) => {
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
    },
    readyProbe,
    { polling: 'raf' },
  );
  await page.evaluate((interactionName) => {
    Reflect.set(window, '__tsumucodeRafFencedPreviewClickStartedAt', undefined);
    window.addEventListener(
      'click',
      (event) => {
        Reflect.set(
          window,
          '__tsumucodeRafFencedPreviewClickStartedAt',
          performance.timeOrigin + event.timeStamp,
        );
      },
      { capture: true, once: true },
    );
    Reflect.set(window, '__tsumucodeRafFencedPreviewClickName', interactionName);
  }, name);

  await action();
  const readyElement = await readyHandle;
  await readyElement.dispose();
  const readyAt = await previewFrame.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve(performance.timeOrigin + performance.now());
          });
        });
      }),
  );
  const startedAt = await page.evaluate((interactionName) => {
    const value = Reflect.get(window, '__tsumucodeRafFencedPreviewClickStartedAt') as unknown;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${interactionName}のclick生成時刻を取得できませんでした`);
    }
    return value;
  }, name);
  await ready.waitFor({ state: 'visible' });
  return { name, durationMs: readyAt - startedAt };
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

  await page.getByRole('link', { name: 'コースマップへ戻る' }).click();
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
      page.getByRole('heading', { level: 1, name: 'HTMLは画面に載せる内容を受け持つ' }),
      { selector: 'main h1', exactText: 'HTMLは画面に載せる内容を受け持つ' },
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
  await page.evaluate(() => {
    performance.clearMeasures('tsumucode:validation');
  });
  measurements.push(
    await measureInteraction(
      page,
      'exercise-validate',
      () => page.getByRole('button', { name: '判定する' }).click(),
      page.getByRole('heading', { name: 'あと一歩' }),
      { selector: '[data-testid="validation-feedback"] h2', exactText: 'あと一歩' },
    ),
  );
  const controllerValidationMs = await page.evaluate(() => {
    const duration = performance.getEntriesByName('tsumucode:validation').at(-1)?.duration;
    if (duration === undefined) throw new Error('Controllerの判定時間を取得できませんでした');
    return duration;
  });

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
      page.locator('.cm-editor.cm-focused'),
      { selector: '.cm-editor.cm-focused' },
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
    body: Buffer.from(
      JSON.stringify({ measurements, controllerValidationMs, draftPersistenceMs }, undefined, 2),
    ),
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

test('閲覧モードのHome、目次、Viewer、次Slide、目次Drawerが専用予算内に応答する', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
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

  await page.goto('./#/');
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  const measurements: InteractionMeasurement[] = [];
  measurements.push(
    await measureInteraction(
      page,
      'library-home-to-index',
      () => page.getByRole('link', { name: 'HTML/CSS はじめの一歩：スライドだけ見る' }).click(),
      page.getByRole('heading', {
        level: 1,
        name: 'HTML/CSS はじめの一歩 スライド目次',
      }),
      { selector: 'main h1', exactText: 'HTML/CSS はじめの一歩 スライド目次' },
    ),
  );

  measurements.push(
    await measureInteraction(
      page,
      'library-index-to-viewer',
      () => page.getByRole('link', { name: 'Webページを作る3つの役割を先頭から見る' }).click(),
      page.getByRole('heading', {
        level: 1,
        name: 'Webページは3つの役割でできている',
      }),
      { selector: 'main h1', exactText: 'Webページは3つの役割でできている' },
    ),
  );

  measurements.push(
    await measureInteraction(
      page,
      'library-viewer-next',
      () => page.getByRole('link', { name: '次のスライドへ' }).click(),
      page.getByRole('heading', {
        level: 1,
        name: 'HTMLは画面に載せる内容を受け持つ',
      }),
      { selector: 'main h1', exactText: 'HTMLは画面に載せる内容を受け持つ' },
    ),
  );

  measurements.push(
    await measureInteraction(
      page,
      'library-viewer-index-drawer',
      () => page.getByRole('button', { name: 'スライド目次を開く' }).click(),
      page.getByRole('dialog', { name: 'スライド目次' }),
      { selector: 'dialog[open] h2', exactText: 'スライド目次' },
    ),
  );

  await testInfo.attach('slide-library-interaction-performance.json', {
    body: Buffer.from(JSON.stringify({ measurements }, undefined, 2)),
    contentType: 'application/json',
  });

  for (const measurement of measurements) {
    expect(measurement.routeReadyMs, measurement.name).toBeLessThanOrEqual(
      manifest.slideLibrary.interactionMaxMs,
    );
    for (const duration of measurement.eventDurationsMs) {
      expect(duration, `${measurement.name} Event Timing`).toBeLessThanOrEqual(
        manifest.slideLibrary.interactionMaxMs,
      );
    }
  }
});

test('Home→PathとPath→最初のCourseのwarm p95を200ms以内に保つ', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
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

  const homeToPath: InteractionMeasurement[] = [];
  const pathToCourse: InteractionMeasurement[] = [];
  const totalRuns = manifest.warmupRuns + manifest.runsPerExercise;
  for (let run = 0; run < totalRuns; run += 1) {
    await page.goto('./#/');
    await expect(
      page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' }),
    ).toBeVisible();
    const pathLink = page.getByRole('link', {
      name: 'フロントエンド学習パスの全体を見る',
    });
    await expect(pathLink).toBeVisible();
    const first = await measureInteraction(
      page,
      `home-to-path-${String(run + 1)}`,
      () => pathLink.click(),
      page.getByRole('heading', { level: 1, name: 'フロントエンド学習パス' }),
      { selector: 'main h1', exactText: 'フロントエンド学習パス' },
    );
    const courseLink = page.locator('[data-learning-path-step] article a').first();
    await expect(courseLink).toBeVisible();
    const second = await measureInteraction(
      page,
      `path-to-course-${String(run + 1)}`,
      () => courseLink.click(),
      page.getByRole('progressbar', { name: 'スライドの現在位置' }),
      { selector: 'progress[aria-label="スライドの現在位置"]' },
    );
    if (run >= manifest.warmupRuns) {
      homeToPath.push(first);
      pathToCourse.push(second);
    }
  }

  const evidence = {
    homeToPath,
    pathToCourse,
    p95: {
      homeToPath: percentile95(homeToPath.map(({ routeReadyMs }) => routeReadyMs)),
      pathToCourse: percentile95(pathToCourse.map(({ routeReadyMs }) => routeReadyMs)),
    },
  };
  await testInfo.attach('learning-path-interaction-performance.json', {
    body: Buffer.from(JSON.stringify(evidence, undefined, 2)),
    contentType: 'application/json',
  });

  expect(homeToPath).toHaveLength(manifest.runsPerExercise);
  expect(pathToCourse).toHaveLength(manifest.runsPerExercise);
  expect(evidence.p95.homeToPath).toBeLessThanOrEqual(manifest.learningPath.interactionMaxMs);
  expect(evidence.p95.pathToCourse).toBeLessThanOrEqual(manifest.learningPath.interactionMaxMs);
  for (const measurement of [...homeToPath, ...pathToCourse]) {
    for (const duration of measurement.eventDurationsMs) {
      expect(duration, `${measurement.name} Event Timing`).toBeLessThanOrEqual(
        manifest.learningPath.interactionMaxMs,
      );
    }
  }
});

test('Long Task計測は2段目RAF内の60ms blockを陽性検出する', async ({ page }) => {
  await page.setContent(`
    <button type="button">Drawerを開く</button>
    <dialog aria-labelledby="long-task-title">
      <h2 id="long-task-title">Long Task確認</h2>
    </dialog>
  `);
  await page.evaluate(() => {
    const button = document.querySelector('button');
    const dialog = document.querySelector('dialog');
    if (!(button instanceof HTMLButtonElement) || !(dialog instanceof HTMLDialogElement)) {
      throw new Error('Long Task positive controlを準備できませんでした');
    }
    button.addEventListener(
      'click',
      () => {
        dialog.showModal();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const blockUntil = performance.now() + 60;
            while (performance.now() < blockUntil) {
              // 2段目RAFと同じrendering taskを意図的にLong Taskへする。
            }
          });
        });
      },
      { once: true },
    );
  });

  const dialog = page.getByRole('dialog', { name: 'Long Task確認' });
  const measurement = await measureReadyPageClick(
    page,
    'long-task-positive-control',
    () => page.getByRole('button', { name: 'Drawerを開く' }).click(),
    dialog,
    { selector: 'dialog[open] h2', exactText: 'Long Task確認' },
  );

  expect(measurement.readyDurationMs).toBeLessThanOrEqual(100);
  expect(measurement.longTaskDurationsMs.some((duration) => duration >= 50)).toBe(true);
});

test('Starter復元Drawerが100ms以内にreadyとなり、2 RAF fenceまでLong Taskを生まない', async ({
  page,
}, testInfo) => {
  const editedHeading = 'Starter復元前の性能計測';
  const starterHeading = 'ここを書き換えます';
  const editedHtml = `<!doctype html><html lang="ja"><body><main><h1>${editedHeading}</h1></main></body></html>`;
  const starter = await readExerciseStarter(
    'html-css-ch00',
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(editedHtml);
  await expect.poll(() => editorText(page)).toBe(editedHtml);
  await page.getByRole('button', { name: 'プレビューを更新' }).click();
  const preview = page.frameLocator('iframe[title="コードのプレビュー"]');
  await expect(preview.getByRole('heading', { name: editedHeading, exact: true })).toBeVisible();
  await expect(preview.getByRole('heading', { name: starterHeading, exact: true })).toHaveCount(0);

  const resetTrigger = page.getByRole('button', { name: '最初に戻す', exact: true });
  await expect(resetTrigger).toBeEnabled();
  const resetDrawer = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  const drawer = await measureReadyPageClick(
    page,
    'starter-reset-drawer',
    () => resetTrigger.click(),
    resetDrawer,
    { selector: 'dialog h2', exactText: '最初のコードに戻しますか？' },
  );

  const confirm = resetDrawer.getByRole('button', { name: '最初のコードに戻す', exact: true });
  const starterPreview = preview.getByRole('heading', { name: starterHeading, exact: true });
  const previewMeasurement = await measureRafFencedPreviewClick(
    page,
    'starter-reset-preview',
    () => confirm.click(),
    starterPreview,
    { selector: 'h1', exactText: starterHeading },
  );

  const storedDraft = (await readStoredProgress(page)).drafts.find(
    (draft) => draft['workspaceId'] === STANDARD_EXERCISE_ID,
  );
  expect(storedDraft?.['files']).toEqual(starter);
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
  await expect(
    page.getByText('最初のコードには戻りましたが、自動保存を完了できませんでした。'),
  ).toHaveCount(0);
  await expect(page.getByText('保存できません。編集内容は画面に残っています')).toHaveCount(0);

  await testInfo.attach('starter-reset-interaction-performance.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          drawerReadyMs: drawer.readyDurationMs,
          drawerRafFenceMs: drawer.rafFenceDurationMs,
          drawerLongTaskDurationsMs: drawer.longTaskDurationsMs,
          previewVisibleMs: previewMeasurement.durationMs,
        },
        undefined,
        2,
      ),
    ),
    contentType: 'application/json',
  });

  expect(drawer.readyDurationMs, drawer.name).toBeLessThanOrEqual(
    manifest.starterReset.drawerReadyMaxMs,
  );
  expect(drawer.longTaskDurationsMs, `${drawer.name} Long Task`).toEqual([]);
  expect(previewMeasurement.durationMs, previewMeasurement.name).toBeLessThanOrEqual(
    manifest.starterReset.previewVisibleMaxMs,
  );
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
