import { readFile } from 'node:fs/promises';
import { expect, type Page, type Request, type Response } from '@playwright/test';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForDraftSaved,
  waitForStoredDraftContent,
} from './progress';

export const COURSE_ROUTE = './#/courses/html-css';
export const STANDARD_LESSON_ID = 'html-css-ch00-l01';
export const STANDARD_EXERCISE_ID = 'html-css-ch00-l01-e01';
export const STANDARD_EXERCISE_TITLE = '内容と見た目を1箇所ずつ変える';
export const PROFILE_WORKSPACE_ID = 'html-css-profile-project';
export const CAPSTONE_WORKSPACE_ID = 'html-css-capstone-landing';

export const PROFILE_STEPS = [
  {
    chapterId: 'html-css-ch12',
    lessonId: 'html-css-ch12-l01',
    exerciseId: 'html-css-ch12-l01-e01',
    title: 'AudienceとSemantic Outlineを作る',
  },
  {
    chapterId: 'html-css-ch12',
    lessonId: 'html-css-ch12-l02',
    exerciseId: 'html-css-ch12-l02-e01',
    title: 'HeaderとHeroでProfileの入口を作る',
  },
  {
    chapterId: 'html-css-ch12',
    lessonId: 'html-css-ch12-l03',
    exerciseId: 'html-css-ch12-l03-e01',
    title: 'AboutとSkillsを再利用Styleで育てる',
  },
  {
    chapterId: 'html-css-ch12',
    lessonId: 'html-css-ch12-l04',
    exerciseId: 'html-css-ch12-l04-e01',
    title: 'WorksとContactを2 Viewportへ収める',
  },
  {
    chapterId: 'html-css-ch12',
    lessonId: 'html-css-ch12-l05',
    exerciseId: 'html-css-ch12-l05-e01',
    title: 'Profile Siteの最終Auditを完了する',
  },
] as const;

export const CAPSTONE_STEP = {
  chapterId: 'html-css-ch13',
  lessonId: 'html-css-ch13-l01',
  exerciseId: 'html-css-ch13-l01-e01',
  title: 'STACK DAY Landing Pageを完成する',
} as const;

/** Hash Router内の公開Exercise pathを組み立てる。 */
export function exerciseRoute(lessonId: string, exerciseId: string): string {
  return `./#/courses/html-css/lessons/${lessonId}/exercises/${exerciseId}`;
}

/** Desktop編集可能条件でExerciseを開き、CodeMirrorと判定操作の準備完了を待つ。 */
export async function openEditableExercise(
  page: Page,
  lessonId: string,
  exerciseId: string,
  expectedTitle: string,
): Promise<void> {
  const pageErrors: string[] = [];
  const networkErrors: string[] = [];
  const recordPageError = (error: Error): void => {
    pageErrors.push(error.stack ?? error.message);
  };
  const recordRequestFailure = (request: Request): void => {
    networkErrors.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    );
  };
  const recordBadResponse = (response: Response): void => {
    if (response.status() >= 400) {
      networkErrors.push(
        `${String(response.status())} ${response.request().method()} ${response.url()}`,
      );
    }
  };
  page.on('pageerror', recordPageError);
  page.on('requestfailed', recordRequestFailure);
  page.on('response', recordBadResponse);
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    await page.goto(exerciseRoute(lessonId, exerciseId));
    await expect(page).toHaveURL(new RegExp(`${lessonId}/exercises/${exerciseId}$`, 'u'));
    await expect(page.getByRole('heading', { level: 1, name: expectedTitle })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('code-workspace')).toBeVisible();
    await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled({ timeout: 15_000 });
    expect(pageErrors, `Exercise初期化中のpage error: ${pageErrors.join('\n')}`).toEqual([]);
    expect(networkErrors, `Exercise初期化中のnetwork error: ${networkErrors.join('\n')}`).toEqual(
      [],
    );
  } catch (error: unknown) {
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '<bodyを取得できません>');
    throw new Error(
      [
        `Exerciseを初期化できませんでした: ${lessonId}/${exerciseId}`,
        `body: ${bodyText.slice(0, 1_000)}`,
        `page errors: ${pageErrors.join('\n') || 'なし'}`,
        `network errors: ${networkErrors.join('\n') || 'なし'}`,
      ].join('\n'),
      { cause: error },
    );
  } finally {
    page.off('pageerror', recordPageError);
    page.off('requestfailed', recordRequestFailure);
    page.off('response', recordBadResponse);
  }
}

/** CodeWorkspaceの指定fileを置換し、仮想描画ではなく保存済み全文で反映を確認する。 */
export async function replaceWorkspaceFile(
  page: Page,
  path: string,
  content: string,
): Promise<void> {
  const tab = page.getByRole('tab', { name: path, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(content);
  await waitForStoredDraftContent(page, content);
}

/** 複数fileのsolutionを実UIから順に入力し、最後のautosave完了まで待つ。 */
export async function replaceWorkspaceFiles(
  page: Page,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await replaceWorkspaceFile(page, path, content);
  }
  await expect
    .poll(async () => {
      const stored = await readStoredProgress(page);
      return stored.drafts.some((draft) => {
        const storedFiles = draft['files'];
        if (typeof storedFiles !== 'object' || storedFiles === null) return false;
        const values = storedFiles as Readonly<Record<string, unknown>>;
        return Object.entries(files).every(([path, content]) => values[path] === content);
      });
    })
    .toBe(true);
  await waitForDraftSaved(page);
}

/** Slide閲覧状態が対象LessonのIndexedDB recordへdurable保存されるまで待つ。 */
export async function expectStoredViewedSlide(
  page: Page,
  lessonId: string,
  slideId: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const stored = await readStoredProgress(page);
      return stored.courses.some((course) => {
        const lessons = course['lessons'];
        if (typeof lessons !== 'object' || lessons === null) return false;
        const lesson = (lessons as Readonly<Record<string, unknown>>)[lessonId];
        if (typeof lesson !== 'object' || lesson === null) return false;
        const viewedSlideIds = (lesson as Readonly<Record<string, unknown>>)['viewedSlideIds'];
        return Array.isArray(viewedSlideIds) && viewedSlideIds.includes(slideId);
      });
    })
    .toBe(true);
}

/** 指定Exerciseのauthoring-only solutionをテストプロセス内だけで読む。 */
export async function readExerciseSolution(
  chapterId: string,
  lessonId: string,
  exerciseId: string,
): Promise<Readonly<Record<string, string>>> {
  const root = `content/html-css/chapters/${chapterId}/lessons/${lessonId}/exercises/${exerciseId}/solution`;
  return {
    'index.html': await readFile(`${root}/index.html`, 'utf8'),
    'styles.css': await readFile(`${root}/styles.css`, 'utf8'),
  };
}

/** 指定Exerciseのauthoring-only starterをテストプロセス内だけで読む。 */
export async function readExerciseStarter(
  chapterId: string,
  lessonId: string,
  exerciseId: string,
): Promise<Readonly<Record<string, string>>> {
  const root = `content/html-css/chapters/${chapterId}/lessons/${lessonId}/exercises/${exerciseId}/starter`;
  return {
    'index.html': await readFile(`${root}/index.html`, 'utf8'),
    'styles.css': await readFile(`${root}/styles.css`, 'utf8'),
  };
}

/** 現在のindex.htmlへ識別Commentを追記し、共有workspaceのdurable保存を待つ。 */
export async function appendWorkspaceMarker(page: Page, marker: string): Promise<string> {
  const indexTab = page.getByRole('tab', { name: 'index.html', exact: true });
  await indexTab.click();
  await expect(indexTab).toHaveAttribute('aria-selected', 'true');
  const next = `${await editorText(page)}\n<!-- ${marker} -->`;
  await replaceEditorText(page, next);
  await waitForDraftSaved(page);
  await expect
    .poll(async () => JSON.stringify((await readStoredProgress(page)).drafts))
    .toContain(marker);
  return next;
}

/** 指定workspaceの保存fileにmarkerが含まれることをIndexedDBから確認する。 */
export async function expectStoredWorkspaceMarker(
  page: Page,
  workspaceId: string,
  marker: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (candidate) => candidate['workspaceId'] === workspaceId,
      );
      return JSON.stringify(draft?.['files'] ?? {});
    })
    .toContain(marker);
}
