import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  exerciseRoute,
  openEditableExercise,
} from './helpers/releaseCourse';
import { replaceEditorText } from './helpers/progress';

interface Rectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface DegradedLayoutMetrics {
  readonly banner: Rectangle;
  readonly toolRail: Rectangle;
  readonly stage: Rectangle;
  readonly pager: Rectangle;
  readonly stageScroll: {
    readonly clientHeight: number;
    readonly scrollHeight: number;
    readonly clientWidth: number;
    readonly scrollWidth: number;
    readonly overflowY: string;
  };
}

const NORMAL_PC_VIEWPORTS = [
  { name: 'desktop-minimum', width: 1024, height: 768 },
  { name: 'desktop-compact', width: 1280, height: 720 },
  { name: 'desktop-wide', width: 1440, height: 900 },
  { name: 'reported-chrome', width: 1470, height: 801 },
] as const;

const LIBRARY_VIEWPORTS = [
  { name: 'mobile-primary', width: 390, height: 844 },
  { name: 'mobile-tall', width: 412, height: 915 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'desktop-compact', width: 1280, height: 720 },
  { name: 'desktop-wide', width: 1440, height: 900 },
] as const;
const LOW_HEIGHT_EVIDENCE_ROOT = path.resolve(
  '.superpowers/sdd/beta-release-implementation-plan/low-height-evidence',
);

/** Locatorの境界を比較しやすいleft/top/right/bottomへ変換する。 */
async function rectangle(locator: Locator): Promise<Rectangle> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('表示要素の境界を取得できませんでした');
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
}

/** 2つの矩形が面積を持って重ならないことを確認する。 */
function expectNoOverlap(left: Rectangle, right: Rectangle): void {
  const subpixelTolerance = 0.5;
  const overlaps =
    Math.min(left.right, right.right) - Math.max(left.left, right.left) > subpixelTolerance &&
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > subpixelTolerance;
  expect(overlaps, `rectangles overlap: ${JSON.stringify({ left, right })}`).toBe(false);
}

/** 通常ViewportでDocument自体に縦横Scrollが発生していないことを確認する。 */
async function expectNoDocumentScroll(page: Page): Promise<void> {
  const root = await page.locator('html').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
  expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
}

/** IndexedDBをfuture versionへ進め、次のApplication openをmemory-onlyへ固定する。 */
async function seedUnsupportedProgressDatabase(page: Page): Promise<void> {
  await page.goto('generated/content/catalog.json');
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tsumucode-progress', 99);
      opening.onsuccess = () => {
        resolve(opening.result);
      };
      opening.onerror = () => {
        reject(opening.error ?? new Error('future database seed failed'));
      };
    });
    database.close();
  });
}

/** memory救済中のbaselineと異なるv2正本を作り、明示retryをconflictへ進める。 */
async function replaceWithDivergedDurableDatabase(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('tsumucode-progress');
      deletion.onsuccess = () => {
        resolve();
      };
      deletion.onerror = () => {
        reject(deletion.error ?? new Error('future database delete failed'));
      };
      deletion.onblocked = () => {
        reject(new Error('future database delete blocked'));
      };
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tsumucode-progress', 2);
      opening.onerror = () => {
        reject(opening.error ?? new Error('diverged database open failed'));
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
      const transaction = database.transaction(['quarantine', 'metadata'], 'readwrite');
      transaction.objectStore('quarantine').put({
        id: 'other-device-state',
        reason: '別の端末保存状態を再現するfixture',
        quarantinedAt: '2026-07-29T00:00:00.000Z',
        raw: { source: 'durable' },
      });
      transaction.objectStore('metadata').put({
        key: 'recordSchemaVersion',
        kind: 'record-schema-version',
        value: 2,
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('diverged database seed failed'));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('diverged database seed aborted'));
        };
      });
    } finally {
      database.close();
    }
  });
}

/** degraded Banner表示時に固定領域とStage救済Scrollの実寸契約を検証する。 */
async function expectDegradedLowHeightLayout(
  page: Page,
  viewport: { readonly width: number; readonly height: number },
  health: 'memory-only' | 'conflict',
): Promise<DegradedLayoutMetrics> {
  const banner = page.locator(`[data-persistence-health-banner="${health}"]`);
  const toolRail = page.getByRole('navigation', { name: '学習ツール' });
  const stage = page.getByTestId('learning-stage');
  const pager = page.locator('.tc-learning-shell-pager');
  const exportButton = banner.getByRole('button', { name: '救済中データを書き出す' });
  const validate = pager.getByRole('button', { name: '判定する', exact: true });
  await expect(banner).toBeVisible();
  await expect(stage).toBeVisible();

  const bannerRect = await rectangle(banner);
  const toolRailRect = await rectangle(toolRail);
  const stageRect = await rectangle(stage);
  const pagerRect = await rectangle(pager);
  expect(bannerRect.top).toBeGreaterThanOrEqual(-0.5);
  expect(bannerRect.bottom).toBeLessThanOrEqual(viewport.height + 0.5);
  expectNoOverlap(bannerRect, toolRailRect);
  expectNoOverlap(toolRailRect, stageRect);
  expectNoOverlap(stageRect, pagerRect);
  const shellChildren = await page.getByTestId('app-shell').evaluate((element) =>
    Array.from(element.children).map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        tag: child.tagName,
        className: child.className,
        role: child.getAttribute('role'),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        text: child.textContent.trim().slice(0, 80),
      };
    }),
  );
  const learningChildren = await page.locator('.tc-learning-viewport-shell').evaluate((element) =>
    Array.from(element.children).map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        className: child.className,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        clientHeight: child.clientHeight,
        scrollHeight: child.scrollHeight,
      };
    }),
  );
  expect(pagerRect.bottom, JSON.stringify({ shellChildren, learningChildren })).toBeLessThanOrEqual(
    viewport.height + 0.5,
  );

  const stageMetrics = await stage.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(stageMetrics.clientHeight).toBeGreaterThanOrEqual(48);
  expect(stageMetrics.scrollHeight).toBeGreaterThan(stageMetrics.clientHeight);
  expect(stageMetrics.overflowY).toBe('auto');
  expect(stageMetrics.scrollWidth).toBeLessThanOrEqual(stageMetrics.clientWidth + 1);

  for (const target of [
    page.getByTestId('code-workspace').getByRole('heading', { name: 'コードを組み立てる' }),
    page.getByTestId('runtime-preview-frame').locator('iframe'),
  ]) {
    await target.scrollIntoViewIfNeeded();
    const targetRect = await rectangle(target);
    const currentStageRect = await rectangle(stage);
    expect(targetRect.right).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(targetRect.bottom).toBeGreaterThan(currentStageRect.top);
    expect(targetRect.top).toBeLessThan(currentStageRect.bottom);
  }
  await expectReachablePrimaryAction(exportButton, viewport.width, viewport.height);
  await expectReachablePrimaryAction(validate, viewport.width, viewport.height);
  await expectNoDocumentScroll(page);
  await expectDocumentScrollAtOrigin(page);
  return {
    banner: bannerRect,
    toolRail: toolRailRect,
    stage: stageRect,
    pager: pagerRect,
    stageScroll: stageMetrics,
  };
}

/** 固定学習Shellの救済Scroll前後でDocument自体が原点から動いていないことを確認する。 */
async function expectDocumentScrollAtOrigin(page: Page): Promise<void> {
  const position = await page.evaluate(() => ({
    windowX: window.scrollX,
    windowY: window.scrollY,
    documentX: document.scrollingElement?.scrollLeft ?? 0,
    documentY: document.scrollingElement?.scrollTop ?? 0,
  }));
  expect(position).toEqual({ windowX: 0, windowY: 0, documentX: 0, documentY: 0 });
}

/** overflow hiddenで見切れていないことをscroll寸法とclient寸法で確認する。 */
async function expectNoHiddenOverflow(locator: Locator): Promise<void> {
  const metrics = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

/** 子要素の四辺がsubpixel誤差を除いて親Workspace境界内に収まることを確認する。 */
async function expectInside(child: Locator, parent: Locator): Promise<void> {
  const childRect = await rectangle(child);
  const parentRect = await rectangle(parent);
  const subpixelTolerance = 0.5;
  expect(childRect.left).toBeGreaterThanOrEqual(parentRect.left - subpixelTolerance);
  expect(childRect.top).toBeGreaterThanOrEqual(parentRect.top - subpixelTolerance);
  expect(childRect.right).toBeLessThanOrEqual(parentRect.right + subpixelTolerance);
  expect(childRect.bottom).toBeLessThanOrEqual(parentRect.bottom + subpixelTolerance);
}

/** Reset TriggerがCodeWorkspace Header内で折返し・重なりなく収まることを実寸で確認する。 */
async function expectResetHeaderLayout(page: Page): Promise<void> {
  const workspace = page.getByTestId('code-workspace');
  const heading = workspace.getByRole('heading', { level: 2, name: 'コードを組み立てる' });
  const header = heading.locator('xpath=ancestor::header');
  const fileCount = workspace.getByText(/^2個のファイルピース$/u);
  const resetTrigger = workspace.getByRole('button', { name: '最初に戻す', exact: true });
  const editor = workspace.locator('.cm-editor');

  await expect(resetTrigger).toBeVisible();
  await expectInside(resetTrigger, header);
  const resetRect = await rectangle(resetTrigger);
  const headingRect = await rectangle(heading);
  const fileCountRect = await rectangle(fileCount);
  const headerRect = await rectangle(header);
  expect(resetRect.right - resetRect.left, 'Reset Triggerの幅').toBeGreaterThanOrEqual(44);
  expect(resetRect.bottom - resetRect.top, 'Reset Triggerの高さ').toBeGreaterThanOrEqual(44);
  expectNoOverlap(resetRect, headingRect);
  expectNoOverlap(resetRect, fileCountRect);
  expectNoOverlap(resetRect, await rectangle(editor));
  expect(resetRect.top, 'Reset Triggerがheading後に折り返されない').toBeLessThan(
    headingRect.bottom - 0.5,
  );
  expect(fileCountRect.top, 'file countがheading後に折り返されない').toBeLessThan(
    headingRect.bottom - 0.5,
  );
  expect(headerRect.bottom - headerRect.top, 'CodeWorkspace Headerの高さ').toBeLessThanOrEqual(100);
  await expectNoHiddenOverflow(header);
}

/** Documentがviewport右端を越えず、対象をscroll後に画面内へ収められることを確認する。 */
async function expectContained(
  page: Page,
  locator: Locator,
  width: number,
  height: number,
  checkVertical = true,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const target = await rectangle(locator);
  expect(target.left).toBeGreaterThanOrEqual(-0.5);
  expect(target.right).toBeLessThanOrEqual(width + 0.5);
  if (checkVertical) {
    expect(target.top).toBeGreaterThanOrEqual(-0.5);
    expect(target.bottom).toBeLessThanOrEqual(height + 0.5);
  }
  const root = await page.locator('html').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
}

/** Scroll済みの主要CTAがviewport内に収まり、44px以上でポインター操作を受け取れることを確認する。 */
async function expectReachablePrimaryAction(
  locator: Locator,
  width: number,
  height: number,
): Promise<void> {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      pointerEvents: getComputedStyle(element).pointerEvents,
      ariaDisabled: element.getAttribute('aria-disabled') === 'true',
      disabled: element instanceof HTMLButtonElement ? element.disabled : false,
      hitTarget: hit === element || (hit !== null && element.contains(hit)),
    };
  });
  expect(result.left).toBeGreaterThanOrEqual(-0.5);
  expect(result.top).toBeGreaterThanOrEqual(-0.5);
  expect(result.right).toBeLessThanOrEqual(width + 0.5);
  expect(result.bottom).toBeLessThanOrEqual(height + 0.5);
  expect(result.width).toBeGreaterThanOrEqual(44);
  expect(result.height).toBeGreaterThanOrEqual(44);
  expect(result.pointerEvents).not.toBe('none');
  expect(result.ariaDisabled).toBe(false);
  expect(result.disabled).toBe(false);
  expect(result.hitTarget).toBe(true);
}

/** 閲覧Viewerの表示中操作を44px以上へ固定し、アイコン表示時も操作面を縮めない。 */
async function expectLibraryTargetSizes(page: Page): Promise<void> {
  const undersized = await page
    .locator('.tc-library-tool-button, .tc-library-pager a')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width + 0.5 < 44 || rect.height + 0.5 < 44
          ? [
              {
                name: element.getAttribute('aria-label') ?? element.textContent.trim(),
                width: rect.width,
                height: rect.height,
              },
            ]
          : [];
      }),
    );
  expect(undersized).toEqual([]);
}

for (const viewport of NORMAL_PC_VIEWPORTS) {
  test(`${viewport.name}でSlideのTool Rail・Stage・Action Railを1画面へ収める`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s04');

    const toolRail = page.getByRole('navigation', { name: '学習ツール' });
    const actionRail = page.locator('.tc-learning-shell-pager');
    const brand = page.getByRole('link', { name: 'TsumuCodeホームへ（ベータ版）' });
    const betaBadge = brand.getByRole('img', { name: 'ベータ版' });
    const course = page.getByRole('link', { name: 'コースマップへ戻る' });
    const learningStage = page.getByTestId('learning-stage');
    const slideStage = page.getByTestId('slide-stage');
    await expect(toolRail).toBeVisible();
    await expect(slideStage.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(betaBadge).toBeVisible();

    const toolRailRect = await rectangle(toolRail);
    const actionRailRect = await rectangle(actionRail);
    const toolRailHeight = toolRailRect.bottom - toolRailRect.top;
    const actionRailHeight = actionRailRect.bottom - actionRailRect.top;
    expect(toolRailHeight).toBeLessThanOrEqual(52);
    expect(actionRailHeight).toBeLessThanOrEqual(56);
    expect(toolRailHeight + actionRailHeight).toBeLessThanOrEqual(108);
    expect((await rectangle(brand)).bottom - (await rectangle(brand)).top).toBeGreaterThanOrEqual(
      44,
    );
    expect((await rectangle(course)).bottom - (await rectangle(course)).top).toBeGreaterThanOrEqual(
      44,
    );
    const badgeRect = await rectangle(betaBadge);
    const brandRect = await rectangle(brand);
    expect(badgeRect.top).toBeGreaterThanOrEqual(brandRect.top - 0.5);
    expect(badgeRect.bottom).toBeLessThanOrEqual(brandRect.bottom + 0.5);
    expect(badgeRect.right).toBeLessThanOrEqual(brandRect.right + 0.5);
    await expectNoDocumentScroll(page);
    await expectNoHiddenOverflow(learningStage);

    await page.goto('./#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01');
    await expect(page.getByTestId('slide-stage')).toBeVisible();
    await expectNoDocumentScroll(page);
    await expectNoHiddenOverflow(page.getByTestId('learning-stage'));
    await expectNoHiddenOverflow(page.getByTestId('slide-stage'));
  });

  test(`${viewport.name}でExerciseの工程票・Editor・Preview・Action Railを1画面へ収める`, async ({
    page,
  }) => {
    await openEditableExercise(
      page,
      STANDARD_LESSON_ID,
      STANDARD_EXERCISE_ID,
      STANDARD_EXERCISE_TITLE,
    );
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const toolRail = page.getByRole('navigation', { name: '学習ツール' });
    const actionRail = page.locator('.tc-learning-shell-pager');
    const learningStage = page.getByTestId('learning-stage');
    const instructions = page.getByRole('complementary', { name: '工程票' });
    const workspace = page.locator('.tc-exercise-workspace');
    await expect(instructions.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/^作業中/u)).toHaveCount(0);

    const toolRailRect = await rectangle(toolRail);
    const actionRailRect = await rectangle(actionRail);
    const toolRailHeight = toolRailRect.bottom - toolRailRect.top;
    const actionRailHeight = actionRailRect.bottom - actionRailRect.top;
    expect(toolRailHeight).toBeLessThanOrEqual(52);
    expect(actionRailHeight).toBeLessThanOrEqual(56);
    expect(toolRailHeight + actionRailHeight).toBeLessThanOrEqual(108);
    await expectNoDocumentScroll(page);
    await expectNoHiddenOverflow(learningStage);
    await expectInside(workspace, learningStage);
    await expectResetHeaderLayout(page);
  });
}

for (const viewport of [
  { name: 'desktop-wide', width: 1440, height: 900 },
  { name: 'desktop-compact', width: 1280, height: 720 },
] as const) {
  test(`${viewport.name}でEditor、Preview、CTAが重ならず横幅へ収まる`, async ({ page }) => {
    await openEditableExercise(
      page,
      STANDARD_LESSON_ID,
      STANDARD_EXERCISE_ID,
      STANDARD_EXERCISE_TITLE,
    );
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const editor = page.getByTestId('code-workspace');
    const preview = page.getByTestId('runtime-preview-frame');
    const validate = page.getByRole('button', { name: '判定する' });
    const pager = page.locator('.tc-learning-shell-pager');
    const pagerActions = page.locator('.tc-exercise-pager-actions');
    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();
    expectNoOverlap(await rectangle(editor), await rectangle(preview));
    await expectContained(page, validate, viewport.width, viewport.height);
    await expectContained(
      page,
      page.getByTestId('runtime-preview-scroll'),
      viewport.width,
      viewport.height,
    );
    await expectInside(page.locator('.cm-editor'), editor);
    await expectInside(page.getByTestId('runtime-preview-frame').locator('section'), preview);
    await expectInside(pagerActions, pager);

    await page.getByRole('button', { name: 'ヒントを見る' }).click();
    const drawer = page.getByRole('dialog', { name: 'ヒント' });
    const drawerPanel = drawer.locator('.tc-learning-drawer-panel');
    const drawerBody = drawer.locator('.tc-learning-drawer-body');
    await expectInside(page.getByRole('button', { name: '閉じる' }), drawerPanel);
    await expectInside(page.getByRole('button', { name: /ヒント1を見る/u }), drawerBody);
    await page.getByRole('button', { name: '閉じる' }).click();

    await page.getByRole('tab', { name: 'styles.css' }).click();
    await replaceEditorText(page, '<main><p>複数診断</p></main>');
    await validate.click();
    await expect(page.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
    await page.getByRole('button', { name: '閉じる' }).click();
    const editorSurface = page.locator('.cm-editor');
    const diagnostics = page.getByRole('list', { name: 'コード診断' });
    await expect(diagnostics).toBeVisible();
    expect(await diagnostics.getByRole('listitem').count()).toBeGreaterThan(1);
    const editorMetrics = await editorSurface.evaluate((element) => ({
      clientHeight: element.clientHeight,
    }));
    const diagnosticMetrics = await diagnostics.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      tabIndex: element.tabIndex,
    }));
    expect(editorMetrics.clientHeight).toBeGreaterThanOrEqual(96);
    expect(diagnosticMetrics.scrollHeight).toBeGreaterThan(diagnosticMetrics.clientHeight);
    expect(diagnosticMetrics.tabIndex).toBe(0);
    expectNoOverlap(await rectangle(editorSurface), await rectangle(diagnostics));
    await expectInside(editorSurface, editor);
    await expectInside(diagnostics, editor);
    await expectNoDocumentScroll(page);
  });

  test(`${viewport.name}でch04の情報量が多いSlideもDocument Scrollや見切れを生まない`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [lessonId, slideId] of [
      ['html-css-ch04-l01', 'html-css-ch04-l01-s03'],
      ['html-css-ch04-l03', 'html-css-ch04-l03-s01'],
      ['html-css-ch04-l04', 'html-css-ch04-l04-s01'],
    ] as const) {
      await page.goto(`./#/courses/html-css/lessons/${lessonId}/slides/${slideId}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage).toBeVisible();
      await expectNoDocumentScroll(page);
      await expectNoHiddenOverflow(stage);
    }
  });

  test(`${viewport.name}でch05からch13の全SlideがDocument Scrollや見切れを生まない`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [chapterNumber, lessonNumbers] of [
      ['05', ['01', '02', '03', '04', '05']],
      ['06', ['01', '02', '03', '04']],
    ] as const) {
      for (const lessonNumber of lessonNumbers) {
        for (const slideNumber of ['01', '02'] as const) {
          const lessonId = `html-css-ch${chapterNumber}-l${lessonNumber}`;
          const slideId = `${lessonId}-s${slideNumber}`;
          await page.goto(`./#/courses/html-css/lessons/${lessonId}/slides/${slideId}`);
          const stage = page.getByTestId('slide-stage');
          await expect(stage).toBeVisible();
          await expectNoDocumentScroll(page);
          await expectNoHiddenOverflow(stage);
        }
      }
    }
    await page.goto('./#/courses/html-css/lessons/html-css-ch07-l01/slides/html-css-ch07-l01-r01');
    const integrationStage = page.getByTestId('slide-stage');
    await expect(integrationStage).toBeVisible();
    await expectNoDocumentScroll(page);
    await expectNoHiddenOverflow(integrationStage);
    for (const lessonNumber of ['01', '02', '03', '04', '05']) {
      for (const slideNumber of ['01', '02']) {
        await page.goto(
          `./#/courses/html-css/lessons/html-css-ch08-l${lessonNumber}/slides/html-css-ch08-l${lessonNumber}-s${slideNumber}`,
        );
        const stage = page.getByTestId('slide-stage');
        await expect(stage).toBeVisible();
        await expectNoDocumentScroll(page);
        await expectNoHiddenOverflow(stage);
      }
    }
    for (const lessonNumber of ['01', '02', '03', '04']) {
      for (const slideNumber of ['01', '02']) {
        await page.goto(
          `./#/courses/html-css/lessons/html-css-ch09-l${lessonNumber}/slides/html-css-ch09-l${lessonNumber}-s${slideNumber}`,
        );
        const stage = page.getByTestId('slide-stage');
        await expect(stage).toBeVisible();
        await expectNoDocumentScroll(page);
        await expectNoHiddenOverflow(stage);
      }
    }
    for (const lessonNumber of ['01', '02', '03', '04', '05']) {
      for (const slideNumber of ['01', '02']) {
        await page.goto(
          `./#/courses/html-css/lessons/html-css-ch10-l${lessonNumber}/slides/html-css-ch10-l${lessonNumber}-s${slideNumber}`,
        );
        const stage = page.getByTestId('slide-stage');
        await expect(stage).toBeVisible();
        await expectNoDocumentScroll(page);
        await expectNoHiddenOverflow(stage);
      }
    }
    for (const lessonNumber of ['01', '02', '03', '04']) {
      for (const slideNumber of ['01', '02']) {
        await page.goto(
          `./#/courses/html-css/lessons/html-css-ch11-l${lessonNumber}/slides/html-css-ch11-l${lessonNumber}-s${slideNumber}`,
        );
        const stage = page.getByTestId('slide-stage');
        await expect(stage).toBeVisible();
        await expectNoDocumentScroll(page);
        await expectNoHiddenOverflow(stage);
      }
    }
    for (const lessonNumber of ['01', '02', '03', '04', '05']) {
      await page.goto(
        `./#/courses/html-css/lessons/html-css-ch12-l${lessonNumber}/slides/html-css-ch12-l${lessonNumber}-g01`,
      );
      const stage = page.getByTestId('slide-stage');
      await expect(stage).toBeVisible();
      await expectNoDocumentScroll(page);
      await expectNoHiddenOverflow(stage);
    }
    await page.goto('./#/courses/html-css/lessons/html-css-ch13-l01/slides/html-css-ch13-l01-g01');
    const capstoneStage = page.getByTestId('slide-stage');
    await expect(capstoneStage).toBeVisible();
    await expectNoDocumentScroll(page);
    await expectNoHiddenOverflow(capstoneStage);
  });
}

for (const viewport of [
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'mobile-portrait', width: 390, height: 844 },
] as const) {
  test(`${viewport.name}ではEditorなしでPC案内、Course、Slide、Progressが境界内に収まる`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID));
    const guide = page.getByRole('heading', { level: 1, name: 'PCで演習を開く' });
    await expect(guide).toBeVisible();
    await expect(page.getByTestId('code-workspace')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '最初に戻す', exact: true })).toHaveCount(0);
    await expectContained(page, guide, viewport.width, viewport.height);

    await page.goto('./#/courses/html-css');
    const courseProgress = page.getByRole('progressbar', { name: 'コース進捗' });
    await expect(courseProgress).toBeVisible();
    await expectContained(page, courseProgress, viewport.width, viewport.height);

    await page.goto('./#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01');
    const slideCard = page.locator('[data-slide-card]');
    const slideProgress = page.getByRole('progressbar', { name: 'スライドの現在位置' });
    await expect(slideCard).toBeVisible();
    await expectContained(page, slideProgress, viewport.width, viewport.height);
    await expectContained(page, slideCard, viewport.width, viewport.height, false);
  });
}

for (const reflow of [
  { name: '200%相当', width: 640 },
  { name: '400%相当', width: 320 },
] as const) {
  test(`${reflow.name}のreflowでも横スクロールを発生させない`, async ({ page }) => {
    await page.setViewportSize({ width: reflow.width, height: 800 });
    for (const path of [
      './#/',
      './#/courses/html-css',
      './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01',
    ]) {
      await page.goto(path);
      const root = await page.locator('html').evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(root.scrollWidth, path).toBeLessThanOrEqual(root.clientWidth);
    }
  });
}

test('200%相当の低いViewportでもSlide Stageに救済Scrollと操作面を残す', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('./#/courses/html-css/lessons/html-css-ch07-l01/slides/html-css-ch07-l01-r01');

  const stage = page.getByTestId('learning-stage');
  const header = page.locator('.tc-learning-shell-header');
  const pager = page.locator('.tc-learning-shell-pager');
  const courseMap = pager.getByRole('link', { name: 'コースマップへ戻る', exact: true });
  await expect(stage).toBeVisible();
  await expectNoDocumentScroll(page);

  const stageMetrics = await stage.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(stageMetrics.clientHeight).toBeGreaterThanOrEqual(96);
  expect(stageMetrics.scrollHeight).toBeGreaterThan(stageMetrics.clientHeight);
  expect(stageMetrics.overflowY).toBe('auto');
  expectNoOverlap(await rectangle(header), await rectangle(stage));
  expectNoOverlap(await rectangle(stage), await rectangle(pager));

  await stage.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const reachableEnd = await stage.evaluate(
    (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
  );
  expect(reachableEnd).toBe(true);
  await expect(courseMap).toHaveAttribute('href', /\/courses\/html-css$/u);
  await expectReachablePrimaryAction(courseMap, 640, 360);
});

test('低いPC ViewportでもExercise Stageに救済Scrollと操作面を残す', async ({ page }) => {
  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
  await replaceEditorText(page, '<main><h1>低いViewportのReset到達性</h1></main>');
  await expect(page.getByRole('button', { name: '最初に戻す', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 1280, height: 360 });

  const main = page.getByRole('main');
  const stage = page.getByTestId('learning-stage');
  const header = page.locator('.tc-learning-shell-header');
  const pager = page.locator('.tc-learning-shell-pager');
  const resetTrigger = stage.getByRole('button', { name: '最初に戻す', exact: true });
  const validate = pager.getByRole('button', { name: '判定する', exact: true });
  await expect(stage).toBeVisible();
  await expectNoDocumentScroll(page);
  await expectDocumentScrollAtOrigin(page);

  const stageMetrics = await stage.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(stageMetrics.clientHeight).toBeGreaterThanOrEqual(64);
  expect(stageMetrics.scrollHeight).toBeGreaterThan(stageMetrics.clientHeight);
  expect(stageMetrics.overflowY).toBe('auto');
  const headerRectangle = await rectangle(header);
  expect(headerRectangle.bottom - headerRectangle.top).toBeLessThanOrEqual(52);
  expectNoOverlap(headerRectangle, await rectangle(stage));
  expectNoOverlap(await rectangle(stage), await rectangle(pager));
  await expectInside(pager, main);

  await stage.evaluate((element) => {
    element.scrollTop = 0;
  });
  const initialStageScroll = await stage.evaluate((element) => element.scrollTop);
  expect(initialStageScroll).toBe(0);
  const bottomStageMetrics = await stage.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      scrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(bottomStageMetrics.scrollTop).toBeGreaterThan(initialStageScroll);
  expect(bottomStageMetrics.scrollTop + bottomStageMetrics.clientHeight).toBeGreaterThanOrEqual(
    bottomStageMetrics.scrollHeight - 1,
  );

  await resetTrigger.scrollIntoViewIfNeeded();
  const resetStageScroll = await stage.evaluate((element) => element.scrollTop);
  expect(resetStageScroll, 'Stage内Resetへ戻るため上方向へscrollする').toBeLessThan(
    bottomStageMetrics.scrollTop,
  );
  await expectReachablePrimaryAction(resetTrigger, 1280, 360);

  const beforePagerAction = await stage.evaluate((element) => element.scrollTop);
  await expectReachablePrimaryAction(validate, 1280, 360);
  const afterPagerAction = await stage.evaluate((element) => element.scrollTop);
  expect(afterPagerAction, 'Pager内判定の検査ではStageをscrollしない').toBe(beforePagerAction);
  await expectNoDocumentScroll(page);
  await expectDocumentScrollAtOrigin(page);
});

test('保存degraded時も低いPCでBanner・Tool Rail・Stage・Pagerを操作可能に保つ', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'failure injectionはChromiumで検証する');
  test.setTimeout(60_000);
  await seedUnsupportedProgressDatabase(page);
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.goto(exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID));
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await expect(page.getByRole('alert', { name: 'この端末へ保存できていません' })).toBeVisible();
  await replaceEditorText(page, '<main><h1>低画面高のmemory救済</h1></main>');
  await expect(page.getByText('保存できません。編集内容は画面に残っています')).toBeVisible();
  const memoryOnlyMetrics = await expectDegradedLowHeightLayout(
    page,
    { width: 1024, height: 500 },
    'memory-only',
  );
  await mkdir(LOW_HEIGHT_EVIDENCE_ROOT, { recursive: true });
  await page.getByTestId('learning-stage').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: path.join(LOW_HEIGHT_EVIDENCE_ROOT, 'memory-only-1024x500.png'),
  });

  await replaceWithDivergedDurableDatabase(page);
  await page.getByRole('button', { name: '端末保存を再試行する' }).click();
  await expect(
    page.getByRole('alert', { name: '端末データの保存先が競合しています' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 600 });
  const conflictMetrics = await expectDegradedLowHeightLayout(
    page,
    { width: 1280, height: 600 },
    'conflict',
  );
  await page.getByTestId('learning-stage').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: path.join(LOW_HEIGHT_EVIDENCE_ROOT, 'conflict-1280x600.png'),
  });
  await writeFile(
    path.join(LOW_HEIGHT_EVIDENCE_ROOT, 'layout-metrics.json'),
    `${JSON.stringify({ memoryOnly: memoryOnlyMetrics, conflict: conflictMetrics }, null, 2)}\n`,
  );
});

for (const viewport of LIBRARY_VIEWPORTS) {
  test(`${viewport.name}で閲覧Viewerを固定Viewportへ収め、目次だけDocument Scrollを許可する`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#/library/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01');

    const shell = page.getByTestId('library-shell');
    const viewportShell = page.getByRole('region', { name: 'スライド閲覧', exact: true });
    const toolRail = page.getByRole('navigation', { name: 'スライド閲覧ツール' });
    const stage = page.getByTestId('learning-stage');
    const pager = page.getByRole('navigation', { name: 'スライド移動' });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Webページは3つの役割でできている' }),
    ).toBeVisible();

    const toolRailRect = await rectangle(toolRail);
    const pagerRect = await rectangle(pager);
    expect(toolRailRect.bottom - toolRailRect.top).toBeLessThanOrEqual(52);
    expect(pagerRect.bottom - pagerRect.top).toBeLessThanOrEqual(56);
    expect(
      toolRailRect.bottom - toolRailRect.top + (pagerRect.bottom - pagerRect.top),
    ).toBeLessThanOrEqual(108);
    await expectNoDocumentScroll(page);
    await expectDocumentScrollAtOrigin(page);
    await expectInside(viewportShell, shell);
    await expectInside(stage, viewportShell);
    await expectLibraryTargetSizes(page);

    await page.getByRole('button', { name: 'スライド目次を開く' }).click();
    const drawer = page.getByRole('dialog', { name: 'スライド目次' });
    const drawerPanel = drawer.locator('.tc-learning-drawer-panel');
    await expect(drawer).toBeVisible();
    await expectInside(drawerPanel, drawer);
    await page.keyboard.press('Escape');

    await page.goto('./#/library/html-css');
    await expect(
      page.getByRole('heading', { level: 1, name: 'HTML/CSS はじめの一歩 スライド目次' }),
    ).toBeVisible();
    const root = await page.locator('html').evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(root.scrollHeight).toBeGreaterThan(root.clientHeight);
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  });
}

test('200%相当の閲覧ViewerはDocumentを固定し、Stageだけを最後まで救済Scrollできる', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('./#/library/html-css/lessons/html-css-ch07-l01/slides/html-css-ch07-l01-r01');

  const stage = page.getByTestId('learning-stage');
  await expect(page.getByTestId('slide-stage')).toBeVisible();
  await expectNoDocumentScroll(page);
  await expectDocumentScrollAtOrigin(page);
  const initial = await stage.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(initial.clientHeight).toBeGreaterThanOrEqual(64);
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
  expect(initial.scrollTop).toBe(0);
  expect(initial.overflowY).toBe('auto');

  const bottom = await stage.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
  });
  expect(bottom.scrollTop).toBeGreaterThan(0);
  expect(bottom.scrollTop + bottom.clientHeight).toBeGreaterThanOrEqual(bottom.scrollHeight - 1);
  await expectNoDocumentScroll(page);
  await expectDocumentScrollAtOrigin(page);
  await expectLibraryTargetSizes(page);
});

test('閲覧Viewerの長いCodeだけを横Scrollし、Document幅は広げない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/library/html-css/lessons/html-css-ch03-l04/slides/html-css-ch03-l04-s02');

  const code = page.locator('[data-slide-horizontal-scroll]');
  await expect(code).toBeVisible();
  const metrics = await code.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.overflowX).toBe('auto');
  await code.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  expect(await code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expectNoDocumentScroll(page);
  await expectDocumentScrollAtOrigin(page);
});
