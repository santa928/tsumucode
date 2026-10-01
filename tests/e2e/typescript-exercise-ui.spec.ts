import { expect, test, type Page } from '@playwright/test';
import { fixtureCourse } from '../fixtures/course';
import { CourseManifestSchema } from '../../src/core/content/schema';
import { CourseCatalogV3Schema } from '../../src/core/content/deliverySchema';
import { canonicalSha256, splitCourseArtifacts } from '../../scripts/content/splitCourseArtifacts';
import { stringifyCanonicalJson } from '../../scripts/content/compileCourse';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';
import { testServerUrl } from './helpers/testBasePath';

const invalidSource = 'const score: number = "2";\nconsole.log(score);';
const validSource =
  'const score: number = 2;\nconsole.log(score);\nconst heading = document.querySelector("h1");\nif (heading !== null) { heading.textContent = String(score); }';

/** 配信hash付きの非公開TS fixtureだけを差し替え、製品のRunner・採点・保存を使う。 */
async function routeTypeScriptExercise(
  page: Page,
  learningMode?: 'annotation' | 'inference',
): Promise<void> {
  const source = structuredClone(fixtureCourse);
  source.id = 'typescript';
  source.title = 'TypeScript UI検証';
  source.publicationStatus = 'draft';
  source.runnerId = 'typescript';
  source.validatorId = 'typescript';
  const lesson = source.phases[0]!.chapters[0]!.lessons[0]!;
  const exercise = lesson.exercises[0]!;
  exercise.title = '型エラーを修正して結果を確認する';
  exercise.instructions = [
    {
      type: 'paragraph',
      text: 'main.tsの型エラーを修正し、Consoleと画面に2を表示します。これは製品UIの検証用教材です。',
    },
  ];
  exercise.files = [
    { path: 'main.ts', language: 'typescript', content: invalidSource, editable: true },
    { path: 'index.html', language: 'html', content: '<h1>0</h1>', editable: false },
  ];
  exercise.runtime = {
    kind: 'typescript',
    entryFile: 'main.ts',
    sourceType: 'module',
    capabilityProfile: 'dom',
    primaryOutput: 'console',
  };
  exercise.steps = [];
  exercise.validationRules[0]!.assertion = { kind: 'text', operator: 'equals', expected: '2' };
  if (learningMode) {
    const inference = learningMode === 'inference';
    lesson.id = inference ? 'typescript-ch01-l01' : 'typescript-ch01-l02';
    exercise.id = `${lesson.id}-e01`;
    lesson.completion = {
      kind: 'standard',
      finalSlideId: 'slide-html-role',
      requiredExerciseIds: [exercise.id],
    };
    exercise.title = inference ? '数値の型推論を確認する' : '数値の型注釈を確認する';
    exercise.instructions = [
      {
        type: 'paragraph',
        text: inference
          ? '今回はscoreをletで宣言し、型注釈を付けずに数値から型を推論させます。数値の計算とscoreの更新だけを使い、最後のconsole.log(score)で2を表示します。'
          : '今回はscoreをletまたはconstで宣言し、numberの型注釈を付けます。数値の計算とscoreの更新だけを使い、最後のconsole.log(score)で2を表示します。',
      },
    ];
    exercise.runtime.capabilityProfile = 'core';
    const base = exercise.validationRules[0]!;
    exercise.validationRules = [
      {
        ...base,
        id: 'annotation',
        label: inference ? 'scoreの型を数値から推論する' : 'scoreに数値の型注釈がある',
        target: { kind: 'typescript-learning', file: 'main.ts' },
        assertion: {
          kind: 'typescript-learning',
          profile: inference ? 'score-number-inference-v1' : 'score-number-annotation-v1',
        },
        feedback: {
          target: 'scoreの宣言',
          expected: inference ? '型注釈なしのletと数値の初期値を使う' : 'numberの型注釈を使う',
          nextAction: inference
            ? 'let scoreに数値を入れ、型注釈は付けずに確かめましょう。'
            : '宣言の型注釈を確認しましょう。',
        },
      },
      {
        ...base,
        id: 'output',
        label: 'scoreの値2を出力する',
        target: { kind: 'javascript-console' },
        assertion: {
          kind: 'javascript-console',
          operator: 'equals',
          expected: [{ level: 'log', text: '2' }],
        },
      },
    ];
  }
  const course = CourseManifestSchema.parse(source);
  const artifacts = splitCourseArtifacts(course);
  const catalog = CourseCatalogV3Schema.parse({
    schemaVersion: 3,
    courses: [
      {
        id: course.id,
        title: course.title,
        description: course.description,
        audience: course.audience,
        estimatedMinutes: course.estimatedMinutes,
        revision: course.revision,
        publicationStatus: 'draft',
        indexPath: 'generated/content/courses/typescript/index.json',
        indexSha256: canonicalSha256(artifacts.index),
        lessonStarts: [
          {
            lessonId: lesson.id,
            target: { kind: 'slide', targetId: 'slide-html-role' },
          },
        ],
      },
    ],
    learningPaths: [],
  });
  for (const [path, value] of [
    ['catalog-v3.json', catalog],
    ['courses/typescript/index.json', artifacts.index],
    [`courses/typescript/lessons/${lesson.id}.json`, artifacts.lessons[0]],
  ] as const) {
    await page.route(`**/generated/content/${path}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: stringifyCanonicalJson(value),
      }),
    );
  }
}

for (const learningMode of ['annotation', 'inference'] as const) {
  test(`${learningMode}の学習条件がない実コードは出力2でも未達になり、修正後だけ合格して元TSを復元する`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const inference = learningMode === 'inference';
    const lessonId = inference ? 'typescript-ch01-l01' : 'typescript-ch01-l02';
    await routeTypeScriptExercise(page, learningMode);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      `${testServerUrl(4174)}#/courses/typescript/lessons/${lessonId}/exercises/${lessonId}-e01`,
    );
    await expect(
      page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    const inferred = inference
      ? 'let score: number = 2;\nconsole.log(score);'
      : 'let score = 2;\nconsole.log(score);';
    await replaceEditorText(page, inferred);
    await waitForStoredDraftContent(page, inferred);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(
      page.getByText(`今回の${inference ? '型推論' : '型注釈'}とscoreの使い方を確認しましょう。`, {
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: 'できました', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('2');
    await page.screenshot({ path: testInfo.outputPath(`${learningMode}-incomplete.png`) });
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    const corrected = inference
      ? 'let score = 1;\nscore += 1;\nconsole.log(score);'
      : 'let score: number = 1;\nscore += 1;\nconsole.log(score);';
    await replaceEditorText(page, corrected);
    await waitForStoredDraftContent(page, corrected);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.reload();
    await expect.poll(() => editorText(page)).toBe(corrected);
    await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('2', {
      timeout: 20000,
    });
    await page.screenshot({ path: testInfo.outputPath(`${learningMode}-corrected.png`) });
  });
}

test('実TS演習画面で型エラーを未採点とし、Console・修正・合格・再読込で元コードを保持する', async ({
  page,
}, testInfo) => {
  await routeTypeScriptExercise(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    `${testServerUrl(4174)}#/courses/typescript/lessons/lesson-first-heading/exercises/exercise-first-heading`,
  );
  const typeStatus = page.getByText('型を確認してください。まだ実行・採点していません。', {
    exact: true,
  });
  await expect(typeStatus).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('tab', { name: 'Console', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Console', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const editedInvalidSource = `${invalidSource}\n// 編集した型エラーを保存する`;
  await replaceEditorText(page, editedInvalidSource);
  await waitForStoredDraftContent(page, editedInvalidSource);
  const before = await readStoredProgress(page);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 20000,
  });
  const rejected = await readStoredProgress(page);
  expect(rejected.courses).toEqual(before.courses);
  expect(rejected.drafts[0]?.['validationHistory']).toEqual(
    before.drafts[0]?.['validationHistory'],
  );
  await expect.poll(() => editorText(page)).toBe(editedInvalidSource);
  await replaceEditorText(page, validSource);
  await waitForStoredDraftContent(page, validSource);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('2', {
    timeout: 20000,
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const passed = await readStoredProgress(page);
  expect(passed.drafts[0]?.['lastPassingSnapshots']).toBeDefined();
  expect(passed.drafts[0]?.['validationHistory']).not.toEqual(
    before.drafts[0]?.['validationHistory'],
  );
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(validSource);
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('2', {
    timeout: 20000,
  });
  await page.screenshot({ path: testInfo.outputPath('typescript-console.png') });
  await replaceEditorText(page, invalidSource);
  await waitForStoredDraftContent(page, invalidSource);
  const edited = await readStoredProgress(page);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(typeStatus).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('list', { name: 'コード診断' })).toContainText('main.ts:1:7');
  await expect(page.getByText('前回成功時のConsoleです', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  const after = await readStoredProgress(page);
  expect(after.courses).toEqual(edited.courses);
  expect(after.drafts[0]?.['validationHistory']).toEqual(passed.drafts[0]?.['validationHistory']);
  expect(after.drafts[0]?.['lastPassingSnapshots']).toEqual(
    passed.drafts[0]?.['lastPassingSnapshots'],
  );
  await page.screenshot({ path: testInfo.outputPath('typescript-type-error.png') });
});
