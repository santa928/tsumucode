import { readFile } from 'node:fs/promises';
import {
  canonicalSha256,
  reconstructCourseManifest,
  splitCourseArtifacts,
} from '../../scripts/content/splitCourseArtifacts';
import { stringifyCanonicalJson } from '../../scripts/content/compileCourse';
import { expect, test, type Page } from '@playwright/test';
import {
  CourseCatalogV3Schema,
  CourseIndexSchema,
  LessonManifestSchema,
} from '../../src/core/content/deliverySchema';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { testBasePath } from './helpers/testBasePath';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';

/** 既存導入Lessonをテスト内だけDOM操作付きへ差し替え、分割配信hashも同期する。
 * 新教材の完成証拠ではなく、実製品の採点・保存UIを通す統合fixture。
 */
async function routeDomLesson(page: Page): Promise<void> {
  const root = 'dist/generated/content';
  const lessonPath = 'courses/javascript/lessons/javascript-ch00-l01.json';
  const lesson = LessonManifestSchema.parse(
    JSON.parse(await readFile(`${root}/${lessonPath}`, 'utf8')),
  );
  const original = lesson.lesson.exercises[0]!;
  const nextLesson = LessonManifestSchema.parse({
    ...lesson,
    lesson: {
      ...lesson.lesson,
      exercises: [
        {
          ...original,
          runtime: { ...original.runtime, capabilityProfile: 'dom' },
          interactionScenarios: [
            {
              id: 'current-target-flow',
              label: '題名を操作する',
              actions: [
                { id: 'first', kind: 'click', selector: '#message' },
                { id: 'second', kind: 'click', selector: '#message' },
              ],
              checkpoints: [
                {
                  id: 'message-visible',
                  afterActionId: 'second',
                  expectations: [
                    { id: 'message-exists', kind: 'selector-exists', selector: '#message' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const indexPath = 'courses/javascript/index.json';
  const index = CourseIndexSchema.parse(JSON.parse(await readFile(`${root}/${indexPath}`, 'utf8')));
  const originals = await Promise.all(
    index.phases
      .flatMap((phase) => phase.chapters.flatMap((chapter) => chapter.lessons))
      .map(async (outline) =>
        LessonManifestSchema.parse(
          JSON.parse(await readFile(`dist/${outline.manifestPath}`, 'utf8')),
        ),
      ),
  );
  const course = reconstructCourseManifest(index, originals);
  const artifacts = splitCourseArtifacts({
    ...course,
    phases: course.phases.map((phase) => ({
      ...phase,
      chapters: phase.chapters.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map((item) =>
          item.id === lesson.lessonId ? nextLesson.lesson : item,
        ),
      })),
    })),
  });
  const indexSource = stringifyCanonicalJson(artifacts.index);
  const lessonSource = stringifyCanonicalJson(
    artifacts.lessons.find((item) => item.lessonId === lesson.lessonId)!,
  );
  const catalog = CourseCatalogV3Schema.parse(
    JSON.parse(await readFile(`${root}/catalog-v3.json`, 'utf8')),
  );
  const catalogSource = JSON.stringify({
    ...catalog,
    courses: catalog.courses.map((course) =>
      course.id === 'javascript'
        ? { ...course, indexSha256: canonicalSha256(artifacts.index) }
        : course,
    ),
  });
  for (const [path, body] of [
    [lessonPath, lessonSource],
    [indexPath, indexSource],
    ['catalog-v3.json', catalogSource],
  ]) {
    await page.route(`**/generated/content/${path!}`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: body! }),
    );
  }
}

test('DOM操作の未対応は履歴を保ち、修正・Export/Import・Resetで進捗が整合する', async ({
  page,
  browser,
}, testInfo) => {
  await routeDomLesson(page);
  await openEditableJavaScriptExercise(page);
  const solution =
    "document.querySelector('#message').textContent = 'JavaScriptで文字を変えました';\n";
  const valid =
    solution +
    "document.querySelector('#message').addEventListener('click',e=>console.log(e.currentTarget.textContent));\n";
  await replaceEditorText(page, valid);
  await waitForStoredDraftContent(page, valid);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const saved = await readStoredProgress(page);
  const before = saved.drafts.find((draft) => draft['exerciseId'] === 'javascript-ch00-l01-e01')!;
  expect(JSON.stringify(saved.courses)).toContain(
    'interaction:current-target-flow:message-visible',
  );
  expect(JSON.stringify(before['validationHistory'])).toContain(
    'interaction:current-target-flow:message-visible:message-exists',
  );
  await page.getByRole('button', { name: '閉じる', exact: true }).click();

  const unsupported =
    valid +
    "document.querySelector('#message').getRootNode().addEventListener('click',e=>{try{console.log(e.currentTarget);}catch{console.log('caught');}},{once:true});\n";
  await replaceEditorText(page, unsupported);
  await waitForStoredDraftContent(page, unsupported);
  const edited = await readStoredProgress(page);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('この環境のcurrentTarget');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const afterProgress = await readStoredProgress(page);
  const after = afterProgress.drafts.find(
    (draft) => draft['exerciseId'] === 'javascript-ch00-l01-e01',
  )!;
  expect(after['validationHistory']).toEqual(before['validationHistory']);
  expect(after['lastPassingSnapshots']).toEqual(before['lastPassingSnapshots']);
  expect(afterProgress.courses).toEqual(edited.courses);
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(unsupported);
  await replaceEditorText(page, valid);
  await waitForStoredDraftContent(page, valid);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const recovered = await readStoredProgress(page);
  await page.screenshot({ path: testInfo.outputPath('dom-passed.png') });
  await page.goto(`${testBasePath()}#/`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗を書き出す' }).click();
  const bundle = testInfo.outputPath('dom-progress.json');
  await (await download).saveAs(bundle);
  const fresh = await browser.newContext();
  try {
    const imported = await fresh.newPage();
    await routeDomLesson(imported);
    await imported.goto(`${testBasePath()}#/`);
    await expect(imported.getByLabel('進捗Bundleを選ぶ')).toBeEnabled();
    await imported.getByLabel('進捗Bundleを選ぶ').setInputFiles({
      name: 'progress.json',
      mimeType: 'application/json',
      buffer: await readFile(bundle),
    });
    await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
    const reloaded = imported.waitForEvent('domcontentloaded');
    await imported.getByRole('button', { name: 'この内容を読み込む' }).click();
    await reloaded;
    await openEditableJavaScriptExercise(imported);
    await expect.poll(() => editorText(imported)).toBe(valid);
    const restored = await readStoredProgress(imported);
    expect(restored.courses).toEqual(recovered.courses);
    const originalDraft = recovered.drafts.find(
      (draft) => draft['exerciseId'] === 'javascript-ch00-l01-e01',
    )!;
    const restoredDraft = restored.drafts.find(
      (draft) => draft['exerciseId'] === 'javascript-ch00-l01-e01',
    )!;
    expect(restoredDraft['validationHistory']).toEqual(originalDraft['validationHistory']);
    expect(restoredDraft['lastPassingSnapshots']).toEqual(originalDraft['lastPassingSnapshots']);
    await imported.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await imported
      .getByRole('dialog', { name: '最初のコードに戻しますか？' })
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expect
      .poll(async () => JSON.stringify((await readStoredProgress(imported)).courses))
      .not.toContain('interaction:current-target-flow:message-visible');
  } finally {
    await fresh.close();
  }
});

test('DOM保護の設置障害は実UIでも採点履歴・成功snapshotを上書きしない', async ({ page }) => {
  await routeDomLesson(page);
  await openEditableJavaScriptExercise(page);
  const source = "document.querySelector('#message').textContent = 'JavaScriptで文字を変えました';";
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const before = await readStoredProgress(page);
  await page.addInitScript(() => {
    if (window.top === window) return;
    const descriptor = Object.getOwnPropertyDescriptor(Event.prototype, 'currentTarget');
    if (descriptor === undefined) throw new Error('native currentTarget descriptor missing');
    Object.defineProperty(Event.prototype, 'currentTarget', { ...descriptor, configurable: false });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('実行環境の安全な準備ができませんでした');
  await expect.poll(() => editorText(page)).toBe(source);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const after = await readStoredProgress(page);
  expect(after.courses).toEqual(before.courses);
  expect(after.drafts).toEqual(before.drafts);
  await page.goto(`${testBasePath()}#/`);
  await expect(page.getByRole('heading', { name: '学びたいピースを選ぶ' })).toBeVisible();
  // Page限定の障害注入を持たない新画面で、同じContextの学習データから復帰する。
  const recovered = await page.context().newPage();
  try {
    await routeDomLesson(recovered);
    await openEditableJavaScriptExercise(recovered);
    await expect.poll(() => editorText(recovered)).toBe(source);
    await expect(recovered.getByRole('alert')).toHaveCount(0);
    await recovered.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(recovered.getByRole('heading', { name: 'できました', exact: true })).toBeVisible();
  } finally {
    await recovered.close();
  }
});
