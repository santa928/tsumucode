import { expect, test, type Page } from '@playwright/test';
import { editorText } from './helpers/progress';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  openEditableExercise,
  replaceWorkspaceFile,
} from './helpers/releaseCourse';

type Rgb = readonly [red: number, green: number, blue: number];

interface TokenPaint {
  readonly color: string;
  readonly decoration: string;
  readonly text: string;
}

/** CSSのrgb()/rgba()表記をWCAG contrast計算用のRGBへ変換する。 */
function parseRgb(color: string): Rgb {
  const channels = color
    .match(/[\d.]+/gu)
    ?.slice(0, 3)
    .map(Number);
  if (channels?.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    throw new Error(`RGB colorを解析できません: ${color}`);
  }
  return channels as unknown as Rgb;
}

/** sRGB channelをWCAG 2.xのlinear lightへ変換する。 */
function linearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** 2色のWCAG contrast ratioを返す。 */
function contrastRatio(foreground: string, background: string): number {
  const luminance = ([red, green, blue]: Rgb): number =>
    0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
  const foregroundLuminance = luminance(parseRgb(foreground));
  const backgroundLuminance = luminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 現在Fileを空にし、実Keyboard入力を始められる状態へする。 */
async function clearEditor(page: Page): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await expect.poll(() => editorText(page)).toBe('');
}

/** 表示中CodeMirrorのHighlight tokenと背景色を実Browserから取得する。 */
async function readTokenPaints(
  page: Page,
): Promise<{ readonly background: string; readonly tokens: readonly TokenPaint[] }> {
  return page.locator('.cm-editor').evaluate((editor) => ({
    background: getComputedStyle(editor).backgroundColor,
    tokens: Array.from(editor.querySelectorAll<HTMLElement>('.cm-line span'))
      .map((token) => ({
        color: getComputedStyle(token).color,
        decoration: getComputedStyle(token).textDecorationLine,
        text: token.textContent,
      }))
      .filter(({ text }) => text.trim().length > 0),
  }));
}

test.beforeEach(async ({ page }) => {
  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
});

test('HTMLとCSSで標準入力支援が動作する', async ({ page }) => {
  await clearEditor(page);
  await page.keyboard.type('<main>');
  await expect.poll(() => editorText(page)).toBe('<main></main>');
  await page.keyboard.press('Enter');
  await page.keyboard.type('<h1>題名');
  await expect.poll(() => editorText(page)).toContain('\n  <h1>題名</h1>\n');

  await page.getByRole('tab', { name: 'styles.css', exact: true }).click();
  await clearEditor(page);
  await page.keyboard.type('main {');
  await page.keyboard.press('Enter');
  await expect.poll(() => editorText(page)).toContain('\n  \n');
});

test('Tab・括弧・引用符・UndoをFileごとに扱う', async ({ page }) => {
  await clearEditor(page);
  await page.keyboard.insertText('alpha\nbeta');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Tab');
  await expect.poll(() => editorText(page)).toBe('  alpha\n  beta');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => editorText(page)).toBe('alpha\nbeta');

  await clearEditor(page);
  await page.keyboard.type('main { content: "');
  await page.keyboard.type('x');
  await page.keyboard.press('"');
  await page.keyboard.type(' width: calc(');
  await page.keyboard.type('100%');
  await page.keyboard.press(')');
  await expect.poll(() => editorText(page)).toBe('main { content: "x" width: calc(100%)}');
  await page.keyboard.type('!');
  const editedHtml = await editorText(page);
  expect(editedHtml).toBe('main { content: "x" width: calc(100%)!}');

  await page.getByRole('tab', { name: 'styles.css', exact: true }).click();
  await clearEditor(page);
  await page.keyboard.type('css-change');
  await expect.poll(() => editorText(page)).toBe('css-change');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => editorText(page)).not.toContain('css-change');
  await page.keyboard.press('Control+y');
  await expect.poll(() => editorText(page)).toContain('css-change');
  await clearEditor(page);
  await page.keyboard.type("p { content: '");
  await page.keyboard.type('x');
  await page.keyboard.press("'");
  await expect.poll(() => editorText(page)).toBe("p { content: 'x'}");

  await page.getByRole('tab', { name: 'index.html', exact: true }).click();
  await expect.poll(() => editorText(page)).toBe(editedHtml);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => editorText(page)).not.toBe(editedHtml);
});

test('HTMLとCSSのTokenを3色以上かつ4.5対1以上で表示し、Invalidを下線でも示す', async ({ page }) => {
  await replaceWorkspaceFile(page, 'index.html', '<main class="card"><h1>題名</h1></main>');
  const htmlPaint = await readTokenPaints(page);
  const htmlColors = [...new Set(htmlPaint.tokens.map(({ color }) => color))];
  expect(htmlColors.length).toBeGreaterThanOrEqual(3);
  for (const color of htmlColors) {
    expect(contrastRatio(color, htmlPaint.background), color).toBeGreaterThanOrEqual(4.5);
  }

  await replaceWorkspaceFile(
    page,
    'styles.css',
    '.card { color: #185c47; margin: 1rem; content: "unterminated; }',
  );
  const cssPaint = await readTokenPaints(page);
  const cssColors = [...new Set(cssPaint.tokens.map(({ color }) => color))];
  expect(cssColors.length).toBeGreaterThanOrEqual(3);
  for (const color of cssColors) {
    expect(contrastRatio(color, cssPaint.background), color).toBeGreaterThanOrEqual(4.5);
  }

  await replaceWorkspaceFile(page, 'index.html', '<main></article>');
  const invalidHtmlPaint = await readTokenPaints(page);
  expect(invalidHtmlPaint.tokens.some(({ decoration }) => decoration.includes('underline'))).toBe(
    true,
  );
});
