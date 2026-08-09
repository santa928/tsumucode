import { expect, test, type Page } from '@playwright/test';
import {
  JAVASCRIPT_EXERCISE_TITLE,
  javascriptExerciseRoute,
  openEditableJavaScriptExercise,
  type JavaScriptExerciseLocation,
} from './helpers/javascriptCourse';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import { replaceEditorText, waitForDraftSaved } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const COURSE_PATH = `${testBasePath()}#/courses/html-css`;
const LEARNING_PATH = `${testBasePath()}#/paths/frontend`;
const SLIDE_PATH = `${COURSE_PATH}/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01`;
const EXERCISE_PATH = `${COURSE_PATH}/lessons/html-css-ch00-l01/exercises/html-css-ch00-l01-e01`;
const COMPLETION_PATH = `${EXERCISE_PATH}/completion`;
const LIBRARY_INDEX_PATH = `${testBasePath()}#/library/html-css`;
const LIBRARY_SLIDE_PATH = `${LIBRARY_INDEX_PATH}/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01`;
const JAVASCRIPT_LESSON_PATH = `${testBasePath()}#/courses/javascript/lessons/javascript-ch00-l01`;
const JAVASCRIPT_CH01_LESSON_PATH = `${testBasePath()}#/courses/javascript/lessons/javascript-ch01-l01`;
const JAVASCRIPT_CH01_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch01-l01',
  exerciseId: 'javascript-ch01-l01-e01',
  title: '3種類の値をConsoleへ表示する',
};

const VIEWPORTS = [
  { id: 'desktop-wide', width: 1440, height: 900 },
  { id: 'desktop-compact', width: 1280, height: 720 },
  { id: 'tablet-portrait', width: 768, height: 1024 },
  { id: 'mobile-portrait', width: 390, height: 844 },
] as const;

const LIBRARY_VIEWPORTS = [
  { id: 'mobile-primary', width: 390, height: 844 },
  { id: 'mobile-tall', width: 412, height: 915 },
  { id: 'tablet-portrait', width: 768, height: 1024 },
  { id: 'desktop-compact', width: 1280, height: 720 },
  { id: 'desktop-wide', width: 1440, height: 900 },
] as const;

interface VisualScreen {
  readonly id: string;
  readonly path: string;
  readonly prepare?: (page: Page) => Promise<void>;
  readonly ready: (page: Page) => Promise<void>;
}

/** Slide画像が通常のimg取得だけで描画可能になり、壊れたAssetを残していないことを確認する。 */
async function expectSlideImageLoaded(page: Page): Promise<void> {
  const image = page.getByRole('img', {
    name: 'HTMLとCSSをBrowserが画面へ組み立てる流れ',
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => element instanceof HTMLImageElement && element.complete),
    )
    .toBe(true);
  await expect
    .poll(() =>
      image.evaluate((element) => (element instanceof HTMLImageElement ? element.naturalWidth : 0)),
    )
    .toBeGreaterThan(0);
}

/** Screenshot対象を決定的なscroll anchorへ戻し、route遷移時のscroll復元差を除外する。 */
async function stabilizeScreenshotScroll(page: Page, screenId: string): Promise<void> {
  if (
    screenId === 'exercise' &&
    (await page.locator('[data-exercise-mode]').getAttribute('data-exercise-mode')) === 'editable'
  ) {
    return;
  }
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
  await expect
    .poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })))
    .toEqual({ x: 0, y: 0 });
}

/** Completion guardが要求する現在版の進捗とpassing snapshotをIndexedDBへ保存する。 */
async function seedCompletionProgress(page: Page): Promise<void> {
  await page.goto('generated/content/catalog-v3.json');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('tsumucode-progress');
      deletion.onsuccess = () => {
        resolve();
      };
      deletion.onerror = () => {
        reject(deletion.error ?? new Error('database delete failed'));
      };
      deletion.onblocked = () => {
        reject(new Error('database delete blocked'));
      };
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tsumucode-progress', 2);
      opening.onerror = () => {
        reject(opening.error ?? new Error('database open failed'));
      };
      opening.onupgradeneeded = () => {
        const next = opening.result;
        next.createObjectStore('courses', { keyPath: 'courseId' });
        next.createObjectStore('drafts', { keyPath: 'key' });
        next.createObjectStore('backups', { keyPath: 'id' });
        next.createObjectStore('quarantine', { keyPath: 'id' });
        next.createObjectStore('metadata', { keyPath: 'key' });
      };
      opening.onsuccess = () => {
        resolve(opening.result);
      };
    });
    try {
      const now = '2026-07-16T00:00:00.000Z';
      const courseId = 'html-css';
      const lessonId = 'html-css-ch00-l01';
      const exerciseId = 'html-css-ch00-l01-e01';
      const files = {
        'index.html': '<main><h1>わたしの学習ノート</h1></main>',
        'styles.css': 'body { background-color: #fffaf0; }',
      };
      const transaction = database.transaction(['courses', 'drafts', 'metadata'], 'readwrite');
      transaction.objectStore('courses').put({
        courseId,
        contentRevision: '2026-07-29.1',
        lessons: {
          [lessonId]: {
            lessonId,
            viewedSlideIds: [
              'html-css-ch00-l01-s01',
              'html-css-ch00-l01-s02',
              'html-css-ch00-l01-s03',
              'html-css-ch00-l01-s04',
            ],
            currentSlideId: 'html-css-ch00-l01-s04',
            passedExerciseIds: [exerciseId],
            passedChecklistItemIds: [],
            passedRuleIds: ['html-css-ch00-l01-e01-r01', 'html-css-ch00-l01-e01-r02'],
            passedViewportIds: ['desktop-1280'],
            currentComplete: true,
            firstCompletedAt: now,
          },
        },
        currentLessonId: 'html-css-ch00-l02',
        currentChapterId: 'html-css-ch00',
        currentComplete: false,
        updatedAt: now,
      });
      transaction.objectStore('drafts').put({
        key: `${courseId}:${exerciseId}`,
        courseId,
        lessonId,
        exerciseId,
        workspaceId: exerciseId,
        contentRevision: '2026-07-29.1',
        editRevision: 1,
        files,
        selectedFile: 'index.html',
        cursors: { 'index.html': { anchor: 20, head: 20 } },
        validationHistory: [],
        revealedHintIds: [],
        lastPassingSnapshots: {
          [exerciseId]: {
            editRevision: 1,
            contentRevision: '2026-07-29.1',
            files,
            evaluatedAt: now,
          },
        },
        updatedAt: now,
      });
      transaction.objectStore('metadata').put({ key: 'recordSchemaVersion', value: 2 });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('seed failed'));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('seed aborted'));
        };
      });
    } finally {
      database.close();
    }
  });
}

const SCREENS: readonly VisualScreen[] = [
  {
    id: 'home',
    path: testBasePath(),
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' }),
      ).toBeVisible();
      await expect(
        page.getByRole('progressbar', { name: 'HTML/CSS はじめの一歩の進捗' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'この端末の学習データ' })).toBeVisible();
    },
  },
  {
    id: 'learning-path',
    path: LEARNING_PATH,
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'フロントエンド学習パス' }),
      ).toBeVisible();
      await expect(page.getByRole('progressbar', { name: '必須コースの進捗' })).toBeVisible();
      await expect(page.locator('[data-learning-path-step]').first()).toBeVisible();
    },
  },
  {
    id: 'course-map',
    path: COURSE_PATH,
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'HTML/CSS はじめの一歩' }),
      ).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'コース進捗' })).toBeVisible();
    },
  },
  {
    id: 'slide',
    path: SLIDE_PATH,
    ready: async (page) => {
      await expect(page.locator('[data-slide-card]')).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'スライドの現在位置' })).toBeVisible();
      await expectSlideImageLoaded(page);
    },
  },
  {
    id: 'exercise',
    path: EXERCISE_PATH,
    ready: async (page) => {
      const mode = page.locator('[data-exercise-mode]');
      await expect(mode).toBeVisible();
      if ((await mode.getAttribute('data-exercise-mode')) === 'editable') {
        const workspace = page.getByTestId('code-workspace');
        await expect(workspace).toBeVisible();
        await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled();
        await expect(page.getByRole('button', { name: '100%で見る' })).toBeVisible();
        await expect
          .poll(() =>
            page
              .getByTitle('コードのプレビュー')
              .evaluate((element) => getComputedStyle(element).transform !== 'none'),
          )
          .toBe(true);
        await page.locator('.cm-scroller').evaluate((element) => {
          element.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        });
        await expect(page.locator('[data-save-status="idle"]')).toHaveText('自動保存オン');
        await workspace.scrollIntoViewIfNeeded();
      } else {
        await expect(page.getByRole('heading', { name: 'PCで演習を開く' })).toBeVisible();
      }
    },
  },
  {
    id: 'completion',
    path: COMPLETION_PATH,
    prepare: seedCompletionProgress,
    ready: async (page) => {
      await expect(page.getByTestId('learning-completion')).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'レッスンの完成' })).toBeVisible();
    },
  },
];

const LIBRARY_SCREENS: readonly VisualScreen[] = [
  {
    id: 'library-index',
    path: LIBRARY_INDEX_PATH,
    ready: async (page) => {
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'HTML/CSS はじめの一歩 スライド目次',
        }),
      ).toBeVisible();
      await expect(
        page.getByText('進捗を変えずに、すべてのスライドを自由に読めます'),
      ).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
    },
  },
  {
    id: 'library-slide',
    path: LIBRARY_SLIDE_PATH,
    ready: async (page) => {
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Webページは3つの役割でできている',
        }),
      ).toBeVisible();
      await expect(page.getByText('進捗には反映されません')).toBeVisible();
      await expectSlideImageLoaded(page);
      await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
    },
  },
] as const;

test.describe('World-A visual regression', () => {
  test.beforeEach(async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'Baseline画像はChromiumで一意に固定する');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const screen of SCREENS) {
    for (const viewport of VIEWPORTS) {
      test(`${screen.id}-${viewport.id}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await screen.prepare?.(page);
        await page.goto(screen.path);
        await screen.ready(page);
        await stabilizeScreenshotScroll(page, screen.id);
        await expect(page).toHaveScreenshot(`${screen.id}-${viewport.id}.png`, {
          animations: 'disabled',
          caret: 'hide',
          fullPage: false,
        });
      });
    }
  }
});

test.describe('Exercise diagnostic visual regression', () => {
  test.beforeEach(async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'Baseline画像はChromiumで一意に固定する');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const viewport of VIEWPORTS.slice(0, 2)) {
    test(`exercise-diagnostics-${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(EXERCISE_PATH);
      await expect(page.getByTestId('code-workspace')).toBeVisible();
      await page.getByRole('tab', { name: 'styles.css' }).click();
      await replaceEditorText(page, '<main><p>複数診断</p></main>');
      await page.getByRole('button', { name: '判定する' }).click();
      await expect(page.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
      await page.getByRole('button', { name: '閉じる' }).click();
      const diagnostics = page.getByRole('list', { name: 'コード診断' });
      await expect(diagnostics).toBeVisible();
      expect(await diagnostics.getByRole('listitem').count()).toBeGreaterThan(1);
      await expect(page).toHaveScreenshot(`exercise-diagnostics-${viewport.id}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
    });
  }
});

test.describe('Slide library visual regression', () => {
  test.beforeEach(async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'Baseline画像はChromiumで一意に固定する');
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const screen of LIBRARY_SCREENS) {
    for (const viewport of LIBRARY_VIEWPORTS) {
      test(`${screen.id}-${viewport.id}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(screen.path);
        await screen.ready(page);
        await stabilizeScreenshotScroll(page, screen.id);
        await expect(page).toHaveScreenshot(`${screen.id}-${viewport.id}.png`, {
          animations: 'disabled',
          caret: 'hide',
          fullPage: false,
        });
      });
    }
  }
});

test.describe('JavaScript vertical slice visual regression', () => {
  test.beforeEach(async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'Baseline画像はChromiumで一意に固定する');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await observeRuntimePage(page);
  });

  test.afterEach(async ({ page }) => {
    await expect(readRuntimeErrors(page)).resolves.toEqual({
      pageErrors: [],
      unhandledRejections: [],
      consoleErrors: [],
    });
  });

  for (const viewport of [
    { id: 'desktop-compact', width: 1280, height: 720 },
    { id: 'mobile-portrait', width: 390, height: 844 },
  ] as const) {
    for (const slide of [
      { id: 's01', title: 'Webページを作る3つの役割' },
      { id: 's02', title: 'index.htmlからscript.jsへつなぐ' },
      { id: 's03', title: '探す・変える・結果の順に読む' },
      { id: 's04', title: '引用符の内側だけを変える' },
    ] as const) {
      test(`javascript-slide-${slide.id}-${viewport.id}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${JAVASCRIPT_LESSON_PATH}/slides/javascript-ch00-l01-${slide.id}`);
        await expect(page.getByRole('heading', { level: 1, name: slide.title })).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
        await page.getByTestId('learning-stage').evaluate((element) => {
          element.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        });
        await expect(page).toHaveScreenshot(`javascript-slide-${slide.id}-${viewport.id}.png`, {
          animations: 'disabled',
          caret: 'hide',
          fullPage: false,
        });
      });
    }

    test(`javascript-exercise-${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(javascriptExerciseRoute());
      if (viewport.width >= 1024) {
        await expect(
          page.getByRole('heading', { level: 1, name: JAVASCRIPT_EXERCISE_TITLE }),
        ).toBeVisible();
        await expect(page.getByTestId('code-workspace')).toBeVisible();
        await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled();
      } else {
        await expect(page.getByRole('heading', { level: 1, name: 'PCで演習を開く' })).toBeVisible();
        await expect(page.getByTestId('code-workspace')).toHaveCount(0);
      }
      await expect(page).toHaveScreenshot(`javascript-exercise-${viewport.id}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
    });
  }

  test('javascript-slide-s04-mobile-portrait-bottom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${JAVASCRIPT_LESSON_PATH}/slides/javascript-ch00-l01-s04`);
    await expect(
      page.getByRole('heading', { level: 1, name: '引用符の内側だけを変える' }),
    ).toBeVisible();
    const stage = page.getByTestId('learning-stage');
    await stage.evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight, left: 0, behavior: 'auto' });
    });
    await expect
      .poll(() =>
        stage.evaluate(
          (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
        ),
      )
      .toBe(true);
    await expect(page).toHaveScreenshot('javascript-slide-s04-mobile-portrait-bottom.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });

  test('javascript-error-desktop-compact', async ({ page }) => {
    await openEditableJavaScriptExercise(page);
    await replaceEditorText(
      page,
      "document.querySelector('#message').textContent = '引用符が閉じていません;",
    );
    await page.getByRole('button', { name: '判定する' }).click();
    await expect(page.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
    await expect(page).toHaveScreenshot('javascript-error-desktop-compact.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });

  test('javascript-hint-desktop-compact', async ({ page }) => {
    await openEditableJavaScriptExercise(page);
    await page.getByRole('button', { name: 'ヒントを見る' }).click();
    await expect(page.getByRole('dialog', { name: 'ヒント' })).toBeVisible();
    await expect(page).toHaveScreenshot('javascript-hint-desktop-compact.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });

  test('javascript-reset-desktop-compact', async ({ page }) => {
    await openEditableJavaScriptExercise(page);
    await replaceEditorText(page, "document.querySelector('#message').textContent = 'Reset確認';");
    await waitForDraftSaved(page);
    const resetTrigger = page.getByRole('button', { name: '最初に戻す', exact: true });
    await expect(resetTrigger).toBeEnabled();
    await resetTrigger.click();
    await expect(page.getByRole('dialog', { name: '最初のコードに戻しますか？' })).toBeVisible();
    await expect(page).toHaveScreenshot('javascript-reset-desktop-compact.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });

  test('javascript-console-empty-desktop-compact', async ({ page }) => {
    await openEditableJavaScriptExercise(page);
    await page.getByRole('tab', { name: 'Console' }).click();
    await expect(page.getByRole('region', { name: 'Console出力' })).toContainText(
      'まだConsole出力はありません',
    );
    await expect(page).toHaveScreenshot('javascript-console-empty-desktop-compact.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });

  test('javascript-console-100-records-desktop-compact', async ({ page }) => {
    await openEditableJavaScriptExercise(page);
    await replaceEditorText(
      page,
      `for (let index = 0; index < 100; index += 1) console.log(index);
document.querySelector('#message').textContent = 'JavaScriptで文字を変えました';`,
    );
    await waitForDraftSaved(page);
    const update = page.getByRole('button', { name: 'プレビューを更新' });
    await update.click();
    await expect(update).toBeEnabled();
    await page.getByRole('tab', { name: 'Console' }).click();
    await expect(
      page.getByRole('region', { name: 'Console出力' }).getByRole('listitem'),
    ).toHaveCount(100);
    await expect(page).toHaveScreenshot('javascript-console-100-records-desktop-compact.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });

  test('javascript-console-previous-success-desktop-compact', async ({ page }) => {
    await openEditableJavaScriptExercise(page);
    await replaceEditorText(
      page,
      `console.log('前回の記録');
document.querySelector('#message').textContent = 'JavaScriptで文字を変えました';`,
    );
    const update = page.getByRole('button', { name: 'プレビューを更新' });
    await update.click();
    await expect(update).toBeEnabled();
    await replaceEditorText(page, "console.log('編集中'");
    await page.getByRole('tab', { name: 'Console' }).click();
    const consoleRegion = page.getByRole('region', { name: 'Console出力' });
    await expect(consoleRegion).toContainText('前回成功時のConsoleです');
    await expect(consoleRegion).toContainText('前回の記録');
    await expect(page).toHaveScreenshot('javascript-console-previous-success-desktop-compact.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });
});

test.describe('JavaScript Chapter 01 visual regression', () => {
  test.beforeEach(async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'Baseline画像はChromiumで一意に固定する');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await observeRuntimePage(page);
  });

  test.afterEach(async ({ page }) => {
    await expect(readRuntimeErrors(page)).resolves.toEqual({
      pageErrors: [],
      unhandledRejections: [],
      consoleErrors: [],
    });
  });

  for (const viewport of [
    { id: 'desktop-compact', width: 1280, height: 720 },
    { id: 'mobile-portrait', width: 390, height: 844 },
  ] as const) {
    test(`javascript-ch01-slide-s04-${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${JAVASCRIPT_CH01_LESSON_PATH}/slides/javascript-ch01-l01-s04`);
      await expect(
        page.getByRole('heading', { level: 1, name: '3種類の値を順番どおりに書く' }),
      ).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
      await page.getByTestId('learning-stage').evaluate((element) => {
        element.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
      await expect(page).toHaveScreenshot(`javascript-ch01-slide-s04-${viewport.id}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
    });

    test(`javascript-ch01-exercise-${viewport.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(javascriptExerciseRoute(JAVASCRIPT_CH01_EXERCISE));
      if (viewport.width >= 1024) {
        await expect(
          page.getByRole('heading', { level: 1, name: JAVASCRIPT_CH01_EXERCISE.title }),
        ).toBeVisible();
        await expect(page.getByTestId('code-workspace')).toBeVisible();
        await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled();
      } else {
        await expect(page.getByRole('heading', { level: 1, name: 'PCで演習を開く' })).toBeVisible();
        await expect(page.getByTestId('code-workspace')).toHaveCount(0);
      }
      await expect(page).toHaveScreenshot(`javascript-ch01-exercise-${viewport.id}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
      });
    });
  }

  test('javascript-ch01-slide-s04-mobile-portrait-bottom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${JAVASCRIPT_CH01_LESSON_PATH}/slides/javascript-ch01-l01-s04`);
    await expect(
      page.getByRole('heading', { level: 1, name: '3種類の値を順番どおりに書く' }),
    ).toBeVisible();
    const stage = page.getByTestId('learning-stage');
    await stage.evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight, left: 0, behavior: 'auto' });
    });
    await expect
      .poll(() =>
        stage.evaluate(
          (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
        ),
      )
      .toBe(true);
    await expect(page).toHaveScreenshot('javascript-ch01-slide-s04-mobile-portrait-bottom.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
    });
  });
});
