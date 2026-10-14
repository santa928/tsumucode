import { expect, test, type Page } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testBasePath } from '../e2e/helpers/testBasePath';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from '../e2e/helpers/progress';

/** 再開は新たな保存ではないため、保存表示ではなくworkspaceの永続全文を照合する。 */
async function expectStoredSource(page: Page, workspaceId: string, source: string): Promise<void> {
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (entry) => entry['workspaceId'] === workspaceId,
      );
      return (draft?.['files'] as Record<string, unknown> | undefined)?.['main.py'];
    })
    .toBe(source);
}

for (const courseId of ['python-practice', 'python-oop']) {
  const { runtime: course } = await loadAuthoringCourse(`content/${courseId}`);
  const lesson = course.phases[0]!.chapters[0]!.lessons[0]!;
  const exercise = lesson.exercises[0]!;
  const prefix = `${testBasePath()}#/courses/${courseId}/lessons/${lesson.id}`;

  test(`${courseId}で確認済みの不一致を未確認と表示せず再試行を案内する`, async ({
    page,
  }, info) => {
    await page.goto(`${prefix}/exercises/${exercise.id}`);
    const grade = page.getByRole('button', { name: '判定する', exact: true });
    await expect(grade).toBeEnabled({ timeout: 30_000 });
    await grade.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('教材のコード条件に一致しません', { exact: true })).toBeVisible();
    await expect(dialog.getByText('教材のコード条件は未確認', { exact: true })).toHaveCount(0);
    const stored = await readStoredProgress(page);
    const draft = stored.drafts.find((entry) => entry['workspaceId'] === exercise.workspaceId)!;
    expect((draft['validationHistory'] as { status: string }[]).at(-1)?.status).toBe('incomplete');
    expect((draft['files'] as Record<string, unknown>)['main.py']).toBe(
      exercise.files.find(({ path }) => path === 'main.py')!.content,
    );
    await page.screenshot({ path: info.outputPath(`${courseId}-mismatch.png`), fullPage: true });
  });

  test(`${courseId}の編集を保存し、Courseから演習へ再開・reloadして全文を保持する`, async ({
    page,
  }, info) => {
    await page.goto(`${prefix}/slides/${lesson.slides[0]!.id}`);
    await expect(page.getByTestId('slide-stage')).toHaveAttribute(
      'data-slide-id',
      lesson.slides[0]!.id,
    );
    await page.goto(`${prefix}/exercises/${exercise.id}`);
    await expect(page.locator('.cm-content')).toBeVisible();
    const source =
      exercise.files.find(({ path }) => path === 'main.py')!.content +
      '\n# 途中の編集を再開して保持する\n';
    await replaceEditorText(page, source);
    await waitForStoredDraftContent(page, source);

    await page.getByRole('link', { name: 'コースマップへ戻る', exact: true }).click();
    const resume = page.getByRole('link', {
      name: `${lesson.title}レッスンを再開する`,
      exact: true,
    });
    await expect(resume).toHaveAttribute(
      'href',
      `#/courses/${courseId}/lessons/${lesson.id}/resume`,
    );
    await resume.click();
    await expect(page).toHaveURL(new RegExp(`/exercises/${exercise.id}$`, 'u'));
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect
      .poll(async () => (await editorText(page)).replaceAll('\n', ''))
      .toContain(source.replaceAll('\n', ''));
    await expectStoredSource(page, exercise.workspaceId, source);
    await page.reload();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expectStoredSource(page, exercise.workspaceId, source);
    const stored = await readStoredProgress(page);
    const draft = stored.drafts.find((entry) => entry['workspaceId'] === exercise.workspaceId)!;
    expect((draft['files'] as Record<string, unknown>)['main.py']).toBe(source);
    expect(draft['contentRevision']).toBe(course.revision);
    if (courseId === 'python-oop') {
      await test.step('旧revisionの保存値もSourceを保ったまま移行して再開する', async () => {
        // アプリを閉じた独立テスト端末へ旧保存値を置き、実migrationを通す。
        await page.goto(`${testBasePath()}generated/content/catalog-v3.json`);
        await page.evaluate(async (courseId) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('tsumucode-progress');
            request.onsuccess = () => {
              resolve(request.result);
            };
            request.onerror = () => {
              reject(request.error ?? new Error('旧保存値へ接続できません'));
            };
          });
          try {
            const transaction = database.transaction(['courses', 'drafts'], 'readwrite');
            for (const name of ['courses', 'drafts']) {
              const store = transaction.objectStore(name);
              const reading = store.getAll();
              reading.onsuccess = () => {
                for (const record of reading.result as Record<string, unknown>[]) {
                  if (record['courseId'] === courseId) {
                    store.put({ ...record, contentRevision: '2026-10-14.3' });
                  }
                }
              };
            }
            await new Promise<void>((resolve, reject) => {
              transaction.oncomplete = () => {
                resolve();
              };
              transaction.onerror = () => {
                reject(transaction.error ?? new Error('旧保存値を書き込めません'));
              };
              transaction.onabort = () => {
                reject(transaction.error ?? new Error('旧保存値の準備が中断しました'));
              };
            });
          } finally {
            database.close();
          }
        }, courseId);
        expect(
          (await readStoredProgress(page)).drafts.find(
            (entry) => entry['workspaceId'] === exercise.workspaceId,
          )?.['contentRevision'],
        ).toBe('2026-10-14.3');
        await page.goto(`${prefix}/resume`);
        await expect(page).toHaveURL(new RegExp(`/exercises/${exercise.id}$`, 'u'));
        await expect(page.locator('.cm-content')).toBeVisible();
        await expectStoredSource(page, exercise.workspaceId, source);
        const migrated = await readStoredProgress(page);
        expect(
          migrated.drafts.find((entry) => entry['workspaceId'] === exercise.workspaceId)?.[
            'contentRevision'
          ],
        ).toBe(course.revision);
        expect(
          migrated.courses.find((entry) => entry['courseId'] === courseId)?.['contentRevision'],
        ).toBe(course.revision);
        expect(migrated.quarantined).toEqual([]);
      });
    }
    await page.screenshot({ path: info.outputPath(`${courseId}-resumed.png`), fullPage: true });
    await info.attach('保存・再開', {
      body: JSON.stringify(
        {
          courseId,
          lessonId: lesson.id,
          exerciseId: exercise.id,
          contentRevision: course.revision,
          sourcePreserved: true,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  });
}
