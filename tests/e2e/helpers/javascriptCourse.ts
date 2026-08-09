import {
  expect,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';
import { testBasePath } from './testBasePath';

export const JAVASCRIPT_COURSE_ID = 'javascript';
export const JAVASCRIPT_CHAPTER_ID = 'javascript-ch00';
export const JAVASCRIPT_LESSON_ID = 'javascript-ch00-l01';
export const JAVASCRIPT_EXERCISE_ID = 'javascript-ch00-l01-e01';
export const JAVASCRIPT_EXERCISE_TITLE = 'JavaScriptで題名の文字を変える';
export const JAVASCRIPT_STARTER_SOURCE =
  "document.querySelector('#message').textContent = 'ここを書き換えます';\n";
export const JAVASCRIPT_SOLUTION_SOURCE =
  "document.querySelector('#message').textContent = 'JavaScriptで文字を変えました';\n";

export interface JavaScriptExerciseLocation {
  readonly lessonId: string;
  readonly exerciseId: string;
  readonly title: string;
}

const JAVASCRIPT_CH00_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: JAVASCRIPT_LESSON_ID,
  exerciseId: JAVASCRIPT_EXERCISE_ID,
  title: JAVASCRIPT_EXERCISE_TITLE,
};

/** 指定JavaScript Exerciseの公開直接routeを返す。 */
export function javascriptExerciseRoute(
  exercise: JavaScriptExerciseLocation = JAVASCRIPT_CH00_EXERCISE,
): string {
  return `${testBasePath()}#/courses/${JAVASCRIPT_COURSE_ID}/lessons/${exercise.lessonId}/exercises/${exercise.exerciseId}`;
}

/** Desktop編集条件でJavaScript Exerciseを直接開き、遅延Runtimeの準備完了を待つ。 */
export async function openEditableJavaScriptExercise(
  page: Page,
  exercise: JavaScriptExerciseLocation = JAVASCRIPT_CH00_EXERCISE,
): Promise<void> {
  const networkErrors: string[] = [];
  const browserErrors: string[] = [];
  const recordBadResponse = (response: Response): void => {
    if (response.status() >= 400) {
      networkErrors.push(`${String(response.status())} ${response.url()}`);
    }
  };
  const recordRequestFailure = (request: Request): void => {
    networkErrors.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  };
  const recordPageError = (error: Error): void => {
    browserErrors.push(`pageerror: ${error.message}`);
  };
  const recordConsoleError = (message: ConsoleMessage): void => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  };
  page.on('response', recordBadResponse);
  page.on('requestfailed', recordRequestFailure);
  page.on('pageerror', recordPageError);
  page.on('console', recordConsoleError);
  await page.setViewportSize({ width: 1280, height: 720 });
  try {
    await page.goto(javascriptExerciseRoute(exercise));
    await expect(page.getByRole('heading', { level: 1, name: exercise.title })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('code-workspace')).toBeVisible();
    await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId('runtime-preview-frame').locator('iframe')).toBeVisible();
  } catch (error: unknown) {
    const body = await page
      .locator('body')
      .innerText()
      .catch(() => '<bodyを取得できません>');
    throw new Error(
      `JavaScript Exerciseを初期化できませんでした: ${networkErrors.join(', ') || 'network errorなし'}; ${browserErrors.join(', ') || 'browser errorなし'}\nbody: ${body.slice(0, 800)}`,
      { cause: error },
    );
  } finally {
    page.off('response', recordBadResponse);
    page.off('requestfailed', recordRequestFailure);
    page.off('pageerror', recordPageError);
    page.off('console', recordConsoleError);
  }
}
