import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type ConsoleMessage, type Page, type TestInfo } from '@playwright/test';
import { canonicalJson, sha256 } from '../../src/core/persistence/canonicalJson';
import {
  observeRuntimeContext,
  observeStableTopUrl,
  openRuntimeFixture,
  readRuntimeErrors,
  takeRuntimeErrors,
} from './helpers/openRuntimeFixture';
import {
  RUNTIME_EXERCISE_PATH,
  editorText,
  readStoredProgress,
  replaceEditorText,
  seedCompletedProgress,
  seedSchemaV1Progress,
  waitForDraftSaved,
} from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const INVALID_SOURCE = '<main><p>保存と復元</p></main>';
const VALID_SOURCE = '<main><h1>はじめてのWebページ</h1></main>';
const LEGACY_REVISION = '2026-07-10.1';
const LEGACY_FIRST_COMPLETED_AT = '2026-06-15T00:00:00.000Z';
const LEGACY_SOURCE = '<main><h1>旧教材の隔離対象下書き</h1></main>';
const EDITOR_RUNTIME_CHUNK_PATTERN =
  /CodeWorkspace|EditableExercisePage|codemirror|adapters\/runtime\/html-css/iu;
const PLAYWRIGHT_INITIAL_SCRIPTLESS_SANDBOX_WARNING =
  "Blocked script execution in 'about:blank' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";
const PLAYWRIGHT_SRCDOC_SCRIPTLESS_SANDBOX_WARNING =
  "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";

/** unsigned BundleへSHA-256を付け、Unicode pathに依存しないbuffer選択用Fileへ保存する。 */
async function writeSignedBundle(
  testInfo: TestInfo,
  filename: string,
  unsigned: Readonly<Record<string, unknown>>,
): Promise<string> {
  const path = testInfo.outputPath(filename);
  await writeFile(
    path,
    JSON.stringify({
      ...unsigned,
      integrity: { algorithm: 'SHA-256', digest: await sha256(canonicalJson(unsigned)) },
    }),
  );
  return path;
}

/** Export済みBundleのunsigned部だけを変更し、正しいhashで再署名する。 */
async function rewriteSignedBundle(
  testInfo: TestInfo,
  sourcePath: string,
  filename: string,
  mutate: (unsigned: Record<string, unknown>) => void,
): Promise<string> {
  const parsed = JSON.parse(await readFile(sourcePath, 'utf8')) as Record<string, unknown>;
  const unsigned = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key !== 'integrity'),
  );
  mutate(unsigned);
  return writeSignedBundle(testInfo, filename, unsigned);
}

/** 直前教材revisionの全参照fieldと意図的reset対象を含む旧Bundleを返す。 */
function legacyBundleUnsigned(): Readonly<Record<string, unknown>> {
  const updatedAt = '2026-06-16T00:00:00.000Z';
  return {
    schemaVersion: 2,
    courses: {
      'html-css': {
        courseId: 'html-css',
        contentRevision: LEGACY_REVISION,
        lessons: {
          'lesson-first-heading': {
            lessonId: 'lesson-first-heading',
            viewedSlideIds: ['slide-html-role'],
            currentSlideId: 'slide-html-role',
            passedExerciseIds: ['exercise-first-heading'],
            passedChecklistItemIds: [],
            passedRuleIds: ['rule-h1-exists'],
            passedViewportIds: ['desktop'],
            currentComplete: true,
            firstCompletedAt: LEGACY_FIRST_COMPLETED_AT,
          },
        },
        currentLessonId: 'lesson-first-heading',
        currentChapterId: 'ch00-web-map',
        currentComplete: true,
        firstCompletedAt: LEGACY_FIRST_COMPLETED_AT,
        updatedAt,
      },
    },
    drafts: {
      'html-css:workspace-first-heading': {
        courseId: 'html-css',
        lessonId: 'lesson-first-heading',
        exerciseId: 'exercise-first-heading',
        workspaceId: 'workspace-first-heading',
        contentRevision: LEGACY_REVISION,
        editRevision: 7,
        files: { 'index.html': LEGACY_SOURCE },
        selectedFile: 'index.html',
        cursors: { 'index.html': { anchor: 18, head: 18 } },
        validationHistory: [
          {
            exerciseId: 'exercise-first-heading',
            executionRevision: 7,
            status: 'pass',
            checks: [
              {
                ruleId: 'rule-h1-exists',
                requirementId: 'legacy-heading',
                label: '旧見出し判定',
                required: true,
                passed: true,
                requirementPassed: true,
                message: '合格',
                expected: 'h1',
                actual: 'h1',
                nextAction: '次へ',
                hintId: 'hint-h1-1',
                relatedSlideId: 'slide-html-role',
              },
            ],
            passedRequirementIds: ['legacy-heading'],
            diagnostics: [],
            evaluatedAt: updatedAt,
          },
        ],
        revealedHintIds: ['hint-h1-1'],
        reviewSlideId: 'slide-html-role',
        reviewScrollOffset: 132,
        lastPassingSnapshots: {
          'exercise-first-heading': {
            editRevision: 7,
            contentRevision: LEGACY_REVISION,
            files: { 'index.html': LEGACY_SOURCE },
            evaluatedAt: updatedAt,
          },
        },
        updatedAt,
      },
    },
    quarantined: [],
    appVersion: '0.1.0',
    exportedAt: updatedAt,
  };
}

/** Importを介さず旧教材revisionをIndexedDBへ置き、通常Course load migrationを準備する。 */
async function seedLegacyContentProgress(page: Page): Promise<void> {
  const legacy = legacyBundleUnsigned() as {
    readonly courses: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    readonly drafts: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  };
  await page.goto(`${testBasePath()}generated/content/catalog.json`);
  await page.evaluate(async (snapshot) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('tsumucode-progress');
      deletion.onsuccess = () => {
        resolve();
      };
      deletion.onerror = () => {
        reject(deletion.error ?? new Error('legacy seed database delete failed'));
      };
      deletion.onblocked = () => {
        reject(new Error('legacy seed database delete blocked'));
      };
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tsumucode-progress', 2);
      opening.onerror = () => {
        reject(opening.error ?? new Error('legacy seed database open failed'));
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
      const transaction = database.transaction(['courses', 'drafts', 'metadata'], 'readwrite');
      for (const course of Object.values(snapshot.courses)) {
        transaction.objectStore('courses').put(course);
      }
      for (const [key, draft] of Object.entries(snapshot.drafts)) {
        transaction.objectStore('drafts').put({ ...draft, key });
      }
      transaction.objectStore('metadata').put({ key: 'recordSchemaVersion', value: 2 });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('legacy seed transaction failed'));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('legacy seed transaction aborted'));
        };
      });
    } finally {
      database.close();
    }
  }, legacy);
}

/** Backupを除く利用者snapshotをcanonical比較できる文字列へ変換する。 */
function canonicalStoredSnapshot(stored: Awaited<ReturnType<typeof readStoredProgress>>): string {
  return canonicalJson({
    courses: stored.courses,
    drafts: stored.drafts,
    quarantined: stored.quarantined,
  });
}

/** Homeの端末データPanelからBundleをdownloadし、test出力先へ保存する。 */
async function exportBundle(page: Page, testInfo: TestInfo, filename: string): Promise<string> {
  await page.goto(`${testBasePath()}#/`);
  const exportButton = page.getByRole('button', { name: '全コースの進捗を書き出す' });
  await expect(exportButton).toBeEnabled();
  const download = page.waitForEvent('download');
  await exportButton.click();
  const path = testInfo.outputPath(filename);
  await (await download).saveAs(path);
  await expect(page.getByText('全コースの進捗と下書きを書き出しました。')).toBeVisible();
  await expect(exportButton).toBeEnabled();
  return path;
}

/** Import操作が有効になるまで待ち、実際の利用者操作と同じ条件でfileを選ぶ。 */
async function selectBundle(page: Page, path: string): Promise<void> {
  const input = page.getByLabel('進捗Bundleを選ぶ');
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: 'progress.json',
    mimeType: 'application/json',
    buffer: await readFile(path),
  });
}

/** Import fileを差分確認後に適用する。 */
async function importBundle(page: Page, path: string): Promise<void> {
  await selectBundle(page, path);
  await expect(page.getByRole('region', { name: '読み込み差分' })).toBeVisible();
  const reloaded = page.waitForEvent('domcontentloaded');
  await page.getByRole('button', { name: 'この内容を読み込む' }).click();
  await reloaded;
}

/** 非同期retry完了後、救済中Draftがdurable storeへ入るまで状態を条件待ちする。 */
async function waitForStoredDraft(page: Page, expectedSource: string): Promise<void> {
  await expect
    .poll(async () => JSON.stringify((await readStoredProgress(page)).drafts))
    .toContain(expectedSource);
}

/** 実IndexedDBのworkspace ownerを失効済み別tokenへ進め、待機tabの再claimを発火する。 */
async function expireWorkspaceOwnerAndFocus(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tsumucode-progress', 2);
      opening.onsuccess = () => {
        resolve(opening.result);
      };
      opening.onerror = () => {
        reject(opening.error ?? new Error('database open failed'));
      };
    });
    try {
      const key = 'workspaceLease:["html-css","html-css-ch00-l01-e01"]';
      const transaction = database.transaction('metadata', 'readwrite');
      const completion = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('lease replacement transaction failed'));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('lease replacement transaction aborted'));
        };
      });
      const store = transaction.objectStore('metadata');
      const current = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const value: unknown = request.result;
          if (
            typeof value !== 'object' ||
            value === null ||
            (value as { readonly kind?: unknown }).kind !== 'workspace-lease'
          ) {
            reject(new Error('active workspace lease was not found'));
            return;
          }
          resolve(value as Record<string, unknown>);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('workspace lease read failed'));
        };
      });
      store.put({
        ...current,
        ownerId: 'e2e-expired-owner',
        token: 'e2e-expired-token',
        expiresAt: Date.now() - 1,
      });
      await completion;
    } finally {
      database.close();
    }
    window.dispatchEvent(new Event('focus'));
  });
}

/** scriptless sandboxへのengine固有warningだけを発生元まで厳密一致で分離する。 */
function handleScriptlessSandboxError(
  projectName: string,
  automationArtifacts: string[],
): (message: ConsoleMessage) => boolean {
  return (message) => {
    const location = message.location();
    const text = message.text();
    const isChromiumArtifact =
      projectName === 'chromium' &&
      ((text === PLAYWRIGHT_INITIAL_SCRIPTLESS_SANDBOX_WARNING && location.url === 'about:blank') ||
        (text === PLAYWRIGHT_SRCDOC_SCRIPTLESS_SANDBOX_WARNING &&
          location.url === 'about:srcdoc')) &&
      location.lineNumber === 0 &&
      location.columnNumber === 0;
    const isWebkitArtifact =
      projectName === 'webkit' &&
      location.url === 'web-inspector://bootstrap.js' &&
      location.lineNumber === 352 &&
      location.columnNumber === 30;
    if (
      (text === PLAYWRIGHT_INITIAL_SCRIPTLESS_SANDBOX_WARNING ||
        text === PLAYWRIGHT_SRCDOC_SCRIPTLESS_SANDBOX_WARNING) &&
      (isChromiumArtifact || isWebkitArtifact)
    ) {
      automationArtifacts.push(text);
      return true;
    }
    return false;
  };
}

test.beforeEach(async ({ context }) => {
  await observeRuntimeContext(context);
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const errors = await readRuntimeErrors(page);
  expect(errors.pageErrors, 'pageerrorを残さない').toEqual([]);
  expect(errors.unhandledRejections, 'unhandledrejectionを残さない').toEqual([]);
  expect(errors.consoleErrors, 'console errorを残さない').toEqual([]);
});

test('共通observerがPageとtop・frameの未処理例外をnavigation外でも収集する', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'observer自体はChromiumで検証する');
  await page.goto(testBasePath());
  await page.evaluate(() => {
    console.error('observer-console-error');
    void Promise.reject(new Error('observer-top-rejection'));
    window.setTimeout(() => {
      throw new Error('observer-page-error');
    }, 0);
    const frame = document.createElement('iframe');
    frame.srcdoc =
      '<!doctype html><script>Promise.reject(new Error("observer-frame-rejection"))</script>';
    document.body.append(frame);
  });

  await expect
    .poll(async () => {
      const errors = await readRuntimeErrors(page);
      return {
        page: errors.pageErrors.some((error) => error.includes('observer-page-error')),
        top: errors.unhandledRejections.some((error) => error.includes('observer-top-rejection')),
        frame: errors.unhandledRejections.some((error) =>
          error.includes('observer-frame-rejection'),
        ),
        console: errors.consoleErrors.includes('observer-console-error'),
      };
    })
    .toEqual({ page: true, top: true, frame: true, console: true });

  const observed = await takeRuntimeErrors(page);
  expect(observed.pageErrors.some((error) => error.includes('observer-page-error'))).toBe(true);
  expect(
    observed.unhandledRejections.some((error) => error.includes('observer-top-rejection')),
  ).toBe(true);
  expect(
    observed.unhandledRejections.some((error) => error.includes('observer-frame-rejection')),
  ).toBe(true);
  expect(observed.consoleErrors).toContain('observer-console-error');
});

test('code・Hint・判定履歴をOverlay利用後のreloadでも復元する', async ({ page }) => {
  await openRuntimeFixture(page);
  await replaceEditorText(page, INVALID_SOURCE);
  await page.getByRole('button', { name: 'ヒントを見る' }).click();
  await page.getByRole('button', { name: /ヒント1を見る/u }).click();
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩' })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled();
  await page
    .getByRole('button', { name: /関連スライドを見直す/u })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: /関連スライド/u })).toBeVisible();
  await page.getByRole('button', { name: '演習へ戻る' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await waitForDraftSaved(page);

  await page.reload();
  await page.getByTestId('code-workspace').waitFor();

  await expect.poll(() => editorText(page)).toContain('保存と復元');
  await page.getByRole('button', { name: 'ヒントを見る' }).click();
  await expect(page.getByText('Previewでページの題名になっている言葉を確認します。')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: '判定結果を見る' }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩' })).toBeVisible();
});

test('schema v1 DBをv2へ移行し、現行教材でresetされた旧workspaceを隔離する', async ({
  browser,
}) => {
  const context = await browser.newContext();
  await observeRuntimeContext(context);
  const page = await context.newPage();
  await seedSchemaV1Progress(page);
  await openRuntimeFixture(page);

  await expect.poll(() => editorText(page)).toContain('ここを書き換えます');
  const stored = await readStoredProgress(page);
  expect(stored.databaseVersion).toBe(2);
  expect(stored.recordSchemaVersion).toBe(2);
  expect(JSON.stringify(stored.drafts)).not.toContain('移行済み');
  expect(stored.quarantined).toEqual([
    expect.objectContaining({
      reason: expect.stringContaining('lesson:lesson-first-headingをresetしました'),
    }),
  ]);
  expect(await readRuntimeErrors(page)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
  await context.close();
});

test('通常Course loadで直前教材revisionをbackup後に移行しreset対象を隔離する', async ({ page }) => {
  await seedLegacyContentProgress(page);
  await openRuntimeFixture(page);

  await expect.poll(() => editorText(page)).toContain('ここを書き換えます');
  await expect(
    page.getByText('教材の更新に合わせて、一部の進捗を安全に初期化しました。').first(),
  ).toBeVisible();
  const stored = await readStoredProgress(page);
  expect(stored.courses[0]).toMatchObject({
    contentRevision: '2026-07-13.1',
    lessons: {},
    currentComplete: true,
    firstCompletedAt: LEGACY_FIRST_COMPLETED_AT,
  });
  expect(stored.drafts).toEqual([]);
  expect(stored.quarantined.map(({ reason }) => reason)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('lesson:lesson-first-headingをresetしました'),
      expect.stringContaining('chapter:ch00-web-mapをresetしました'),
    ]),
  );
  expect(JSON.stringify(stored.quarantined)).toContain('旧教材の隔離対象下書き');
  expect(stored.backups).toEqual([expect.objectContaining({ reason: 'recovery' })]);

  await page.reload();
  await expect.poll(() => editorText(page)).toContain('ここを書き換えます');
});

test('全Course Bundleを空の新規ContextへImportしてDraftを復元する', async ({
  browser,
  page,
}, testInfo) => {
  await openRuntimeFixture(page);
  await replaceEditorText(page, VALID_SOURCE);
  await waitForDraftSaved(page);
  const bundlePath = await exportBundle(page, testInfo, 'progress.json');

  const fresh = await browser.newContext();
  await observeRuntimeContext(fresh);
  const imported = await fresh.newPage();
  await imported.goto(`${testBasePath()}#/`);
  await importBundle(imported, bundlePath);
  await imported.goto(RUNTIME_EXERCISE_PATH);
  await imported.getByTestId('code-workspace').waitFor();

  await expect.poll(() => editorText(imported)).toContain('はじめてのWebページ');
  expect(await readRuntimeErrors(imported)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
  await fresh.close();
});

test('旧revision Bundleを確定前にreset理由表示して移行し現行Routeを安全に初期化する', async ({
  page,
}, testInfo) => {
  const bundlePath = await writeSignedBundle(
    testInfo,
    'legacy-progress.json',
    legacyBundleUnsigned(),
  );
  await page.goto(`${testBasePath()}#/`);

  await selectBundle(page, bundlePath);

  const preview = page.getByRole('region', { name: '読み込み差分' });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('lesson-first-heading');
  await expect(preview).toContainText('完全CourseでLesson完了条件が増えるため');
  expect((await readStoredProgress(page)).quarantined).toEqual([]);

  const reloaded = page.waitForEvent('domcontentloaded');
  await page.getByRole('button', { name: 'この内容を読み込む' }).click();
  await reloaded;
  await page.getByRole('heading', { name: 'この端末の学習データ' }).waitFor();

  const stored = await readStoredProgress(page);
  expect(stored.courses).toEqual([
    expect.objectContaining({
      contentRevision: '2026-07-13.1',
      firstCompletedAt: LEGACY_FIRST_COMPLETED_AT,
      lessons: {},
    }),
  ]);
  expect(stored.drafts).toEqual([]);
  expect(stored.quarantined.map(({ reason }) => reason)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('lesson:lesson-first-headingをresetしました'),
      expect.stringContaining('chapter:ch00-web-mapをresetしました'),
    ]),
  );
  expect(JSON.stringify(stored.quarantined)).toContain('旧教材の隔離対象下書き');
  expect(stored.backups).toEqual([expect.objectContaining({ reason: 'before-import' })]);

  await page.goto(RUNTIME_EXERCISE_PATH);
  await page.getByTestId('code-workspace').waitFor();
  await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('.cm-content')).toContainText('ここを書き換えます');
  await page.reload();
  await page.getByTestId('code-workspace').waitFor();
  await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('.cm-content')).toContainText('ここを書き換えます');
});

test('chain欠落・future content revisionの署名済Bundleを拒否して既存snapshotを不変に保つ', async ({
  page,
}, testInfo) => {
  await openRuntimeFixture(page);
  await replaceEditorText(page, INVALID_SOURCE);
  await waitForStoredDraft(page, '保存と復元');
  const sourcePath = await exportBundle(page, testInfo, 'content-revision-source.json');
  const before = await readStoredProgress(page);
  expect(before.drafts).toHaveLength(1);
  expect(before.backups).toEqual([]);
  const beforeCanonical = canonicalStoredSnapshot(before);

  for (const [label, revision] of [
    ['chain-missing', '2026-06-15.missing'],
    ['future', '2099-01-01.1'],
  ] as const) {
    const path = await rewriteSignedBundle(testInfo, sourcePath, `${label}.json`, (unsigned) => {
      const courses = unsigned.courses as Record<string, Record<string, unknown>>;
      const drafts = unsigned.drafts as Record<string, Record<string, unknown>>;
      const course = courses['html-css'];
      if (course !== undefined) course.contentRevision = revision;
      for (const draft of Object.values(drafts)) draft.contentRevision = revision;
    });

    await selectBundle(page, path);
    await expect(page.getByText(/元のデータは保持されています/u)).toBeVisible();
    await expect(page.getByRole('region', { name: '読み込み差分' })).toHaveCount(0);
    const after = await readStoredProgress(page);
    expect(after.backups, `${label}はbackupを作らない`).toEqual([]);
    expect(canonicalStoredSnapshot(after), `${label}は既存snapshotを変更しない`).toBe(
      beforeCanonical,
    );
  }
});

test('hash不一致とfuture schema Bundleを拒否し既存Draftを保持する', async ({ page }, testInfo) => {
  await openRuntimeFixture(page);
  await replaceEditorText(page, INVALID_SOURCE);
  await waitForDraftSaved(page);
  const originalPath = await exportBundle(page, testInfo, 'original.json');
  const original = JSON.parse(await readFile(originalPath, 'utf8')) as Record<string, unknown> & {
    integrity: { algorithm: 'SHA-256'; digest: string };
  };

  const corrupt = structuredClone(original);
  corrupt.integrity.digest = '0'.repeat(64);
  const corruptPath = testInfo.outputPath('corrupt.json');
  await writeFile(corruptPath, JSON.stringify(corrupt));
  await selectBundle(page, corruptPath);
  await expect(page.getByText(/元のデータは保持されています/u)).toBeVisible();

  const future = structuredClone(original);
  future.schemaVersion = 99;
  const futureUnsigned = Object.fromEntries(
    Object.entries(future).filter(([key]) => key !== 'integrity'),
  );
  future.integrity = {
    algorithm: 'SHA-256',
    digest: await sha256(canonicalJson(futureUnsigned)),
  };
  const futurePath = testInfo.outputPath('future.json');
  await writeFile(futurePath, JSON.stringify(future));
  await selectBundle(page, futurePath);
  await expect(page.getByText(/元のデータは保持されています/u)).toBeVisible();

  await page.goto(RUNTIME_EXERCISE_PATH);
  await page.getByTestId('code-workspace').waitFor();
  await expect.poll(() => editorText(page)).toContain('保存と復元');
});

test('IndexedDB open拒否でもmemory救済・緊急Export・明示retryで復旧する', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'failure injectionはChromiumで検証する');
  await page.goto('generated/content/catalog.json');
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tsumucode-progress', 99);
      opening.onsuccess = () => {
        resolve(opening.result);
      };
      opening.onerror = () => {
        reject(opening.error ?? new Error('seed open failed'));
      };
    });
    database.close();
  });
  await openRuntimeFixture(page);
  await expect(page.getByRole('alert', { name: 'この端末へ保存できていません' })).toBeVisible();
  await replaceEditorText(page, '<main><p>memory救済</p></main>');
  await expect(page.getByText('保存できません。編集内容は画面に残っています')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '救済中データを書き出す' }).click();
  const emergencyPath = testInfo.outputPath('emergency.json');
  await (await download).saveAs(emergencyPath);
  expect(await readFile(emergencyPath, 'utf8')).toContain('memory救済');

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('tsumucode-progress');
      deletion.onsuccess = () => {
        resolve();
      };
      deletion.onerror = () => {
        reject(deletion.error ?? new Error('delete failed'));
      };
      deletion.onblocked = () => {
        reject(new Error('delete blocked'));
      };
    });
  });
  await page.getByRole('button', { name: '端末保存を再試行する' }).click();
  await waitForStoredDraft(page, 'memory救済');
  await expect(page.getByRole('alert', { name: 'この端末へ保存できていません' })).toHaveCount(0);
});

test('Quota write失敗は最新Draftをmemoryへ残しretry後にdurableへ反映する', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'failure injectionはChromiumで検証する');
  await openRuntimeFixture(page);
  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype;
    const original = Object.getOwnPropertyDescriptor(prototype, 'put')?.value as
      | ((this: IDBObjectStore, value: unknown, key?: IDBValidKey) => IDBRequest<IDBValidKey>)
      | undefined;
    if (original === undefined) throw new Error('IDBObjectStore.put is unavailable');
    prototype.put = function (...args): IDBRequest<IDBValidKey> {
      if (this.name === 'drafts') {
        prototype.put = original;
        throw new DOMException('fault injection', 'QuotaExceededError');
      }
      return Reflect.apply(original, this, args);
    };
  });
  await replaceEditorText(page, '<main><p>容量不足でも残る</p></main>');

  await expect(page.getByRole('alert', { name: 'この端末へ保存できていません' })).toContainText(
    '保存容量が不足',
  );
  await page.getByRole('button', { name: '端末保存を再試行する' }).click();
  await waitForStoredDraft(page, '容量不足でも残る');
  await expect(page.getByRole('alert', { name: 'この端末へ保存できていません' })).toHaveCount(0);
});

test('Import replace transaction失敗時はbackupを含めrollbackして既存Draftを保持する', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'failure injectionはChromiumで検証する');
  const existingSource = '<main><p>既存の内容B</p></main>';
  const incomingSource = '<main><h1>読み込む内容A</h1></main>';
  await openRuntimeFixture(page);
  await replaceEditorText(page, existingSource);
  await waitForStoredDraft(page, '既存の内容B');
  const sourcePath = await exportBundle(page, testInfo, 'transaction-source.json');
  const incomingPath = await rewriteSignedBundle(
    testInfo,
    sourcePath,
    'transaction-incoming.json',
    (unsigned) => {
      const drafts = unsigned.drafts as Record<string, Record<string, unknown>>;
      for (const draft of Object.values(drafts)) {
        draft.files = { 'index.html': incomingSource };
        draft.editRevision = 99;
        draft.updatedAt = '2026-07-16T00:00:09.000Z';
      }
    },
  );
  await selectBundle(page, incomingPath);
  const preview = page.getByRole('region', { name: '読み込み差分' });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('置き換え');
  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype;
    const original = Object.getOwnPropertyDescriptor(prototype, 'put')?.value as
      | ((this: IDBObjectStore, value: unknown, key?: IDBValidKey) => IDBRequest<IDBValidKey>)
      | undefined;
    if (original === undefined) throw new Error('IDBObjectStore.put is unavailable');
    prototype.put = function (...args): IDBRequest<IDBValidKey> {
      const request = Reflect.apply(original, this, args);
      if (this.name === 'metadata') {
        prototype.put = original;
        this.transaction.abort();
      }
      return request;
    };
  });
  await page.getByRole('button', { name: 'この内容を読み込む' }).click();
  await expect(page.getByText(/読み込みを完了できませんでした/u)).toBeVisible();

  const stored = await readStoredProgress(page);
  expect(JSON.stringify(stored.drafts)).toContain('既存の内容B');
  expect(JSON.stringify(stored.drafts)).not.toContain('読み込む内容A');
  expect(stored.backups).toEqual([]);

  await page.goto(RUNTIME_EXERCISE_PATH);
  await page.getByTestId('code-workspace').waitFor();
  await expect.poll(() => editorText(page)).toContain('既存の内容B');
});

test('2 Pageの同一workspaceはtakeover完了後の1 Pageだけが編集する', async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '2 Page leaseはChromiumで検証する');
  await openRuntimeFixture(page);
  const second = await context.newPage();
  const secondRequests: string[] = [];
  second.on('request', (request) => secondRequests.push(request.url()));
  await second.setViewportSize({ width: 1280, height: 720 });
  await second.goto(RUNTIME_EXERCISE_PATH);

  await expect(second.getByRole('heading', { name: '別のタブで編集中です' })).toBeVisible();
  await expect(second.getByTestId('code-workspace')).toHaveCount(0);
  expect(secondRequests.filter((url) => EDITOR_RUNTIME_CHUNK_PATTERN.test(url))).toEqual([]);
  await second.getByRole('button', { name: 'このタブで編集を引き継ぐ' }).click();
  await second.getByTestId('code-workspace').waitFor();
  await expect(page.getByTestId('code-workspace')).toHaveCount(0);
  await expect(page.getByText('このタブの編集は終了しました。')).toBeVisible();

  await replaceEditorText(second, '<main><p>引き継ぎ後だけ保存</p></main>');
  await waitForDraftSaved(second);
  expect(JSON.stringify((await readStoredProgress(second)).drafts)).toContain('引き継ぎ後だけ保存');
  expect(await readRuntimeErrors(second)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
  await second.close();
});

test('focus再検証はdebounce中の編集をsettleし、self lease復帰後も同じコードを保つ', async ({
  page,
}) => {
  const pendingSource = '<main><h1>focus直前の未保存編集</h1></main>';
  await openRuntimeFixture(page);
  await replaceEditorText(page, pendingSource);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await page.getByTestId('code-workspace').waitFor();
  await expect.poll(() => editorText(page)).toContain('focus直前の未保存編集');
  await waitForStoredDraft(page, 'focus直前の未保存編集');
  expect(await readRuntimeErrors(page)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
});

test('suspend/expiry後に待機tabが実IndexedDBをclaimし、旧tabのstale autosaveを緊急Exportへ残す', async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    '実IndexedDB stale owner競合はChromiumで検証する',
  );
  const durableSource = '<main><p>切替前の正本</p></main>';
  const rescuedSource = '<main><h1>期限切れ後に救済する編集</h1></main>';
  await openRuntimeFixture(page);
  await replaceEditorText(page, durableSource);
  await waitForStoredDraft(page, '切替前の正本');
  const second = await context.newPage();
  await second.setViewportSize({ width: 1280, height: 720 });
  await second.goto(RUNTIME_EXERCISE_PATH);
  await expect(second.getByRole('heading', { name: '別のタブで編集中です' })).toBeVisible();
  await replaceEditorText(page, rescuedSource);

  await expireWorkspaceOwnerAndFocus(second);

  await second.getByTestId('code-workspace').waitFor();
  await expect(page.getByRole('heading', { name: '別のタブで編集中です' })).toBeVisible();
  const stored = JSON.stringify((await readStoredProgress(second)).drafts);
  expect(stored).toContain('切替前の正本');
  expect(stored).not.toContain('期限切れ後に救済する編集');
  await page.getByRole('link', { name: '救済用に端末データを書き出す' }).click();
  const exportButton = page.getByRole('button', { name: '全コースの進捗を書き出す' });
  await expect(exportButton).toBeEnabled();
  const download = page.waitForEvent('download');
  await exportButton.click();
  const exportedPath = testInfo.outputPath('stale-owner-emergency.json');
  await (await download).saveAs(exportedPath);
  const exported = await readFile(exportedPath, 'utf8');
  expect(exported).toContain('期限切れ後に救済する編集');
  expect(await readRuntimeErrors(page)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
  expect(await readRuntimeErrors(second)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
  await second.close();
});

test('Import後の旧Editorは新epochを再claimせずstale autosaveで正本を上書きしない', async ({
  browser,
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '2 Page epoch fenceはChromiumで検証する');
  const importedSource = '<main><h1>Import後の正本</h1></main>';
  const staleBeforeImport = '<main><p>Import前の旧tab</p></main>';
  const staleAfterImport = '<main><p>Import後のstale autosave</p></main>';
  const bundleContext = await browser.newContext();
  await observeRuntimeContext(bundleContext);
  const bundlePage = await bundleContext.newPage();
  await openRuntimeFixture(bundlePage);
  await replaceEditorText(bundlePage, importedSource);
  await waitForDraftSaved(bundlePage);
  const bundlePath = await exportBundle(bundlePage, testInfo, 'epoch-fence-import.json');
  await bundleContext.close();

  await openRuntimeFixture(page);
  await replaceEditorText(page, staleBeforeImport);
  await waitForStoredDraft(page, 'Import前の旧tab');
  const importer = await context.newPage();
  await importer.goto(`${testBasePath()}#/`);
  await selectBundle(importer, bundlePath);
  await expect(importer.getByRole('region', { name: '読み込み差分' })).toBeVisible();

  await replaceEditorText(page, staleAfterImport);
  const reloaded = importer.waitForEvent('domcontentloaded');
  await importer.getByRole('button', { name: 'この内容を読み込む' }).click();
  await reloaded;
  await expect
    .poll(async () => JSON.stringify((await readStoredProgress(importer)).drafts))
    .toContain('Import後の正本');

  await expect(page.getByText('このタブの編集は終了しました。')).toBeVisible();
  await expect(page.getByTestId('code-workspace')).toHaveCount(0);
  const storedAfterRejectedAutosave = JSON.stringify((await readStoredProgress(importer)).drafts);
  expect(storedAfterRejectedAutosave).toContain('Import後の正本');
  expect(storedAfterRejectedAutosave).not.toContain('Import後のstale autosave');
  expect(await readRuntimeErrors(page)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
  expect(await readRuntimeErrors(importer)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
  await importer.close();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test(`${String(viewport.width)}pxではEditor chunkなしで完了Previewと端末データ導線を使える`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ viewport });
    const automationArtifacts: string[] = [];
    await observeRuntimeContext(context, {
      handleConsoleError: handleScriptlessSandboxError(testInfo.project.name, automationArtifacts),
    });
    await context.addInitScript(() => {
      const clipboardWindow = window as Window & { __tsumucodeCopiedUrls?: string[] };
      clipboardWindow.__tsumucodeCopiedUrls = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string): Promise<void> => {
            clipboardWindow.__tsumucodeCopiedUrls?.push(value);
          },
        },
      });
    });
    const page = await context.newPage();
    await seedCompletedProgress(page);
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.goto(RUNTIME_EXERCISE_PATH);

    await expect(
      page.getByRole('heading', { name: '内容と見た目を1箇所ずつ変えるの完成Preview' }),
    ).toBeVisible();
    const previewFrame = page.getByTestId('runtime-preview-frame').locator('iframe');
    await expect(previewFrame).toHaveAttribute('sandbox', '');
    await expect
      .poll(async () =>
        previewFrame.evaluate((element) => {
          const frame = element as HTMLIFrameElement;
          const preview = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
          return {
            scriptCount: preview.querySelectorAll('script').length,
            bridgeCount: preview.querySelectorAll('[data-tsumucode-preview-bridge]').length,
            inactiveAnchorIds: [
              ...preview.querySelectorAll('a:not([href]):not([role]):not([tabindex])'),
            ]
              .map((anchor) => anchor.id)
              .sort(),
            csp:
              preview
                .querySelector('meta[http-equiv="Content-Security-Policy"]')
                ?.getAttribute('content') ?? null,
          };
        }),
      )
      .toMatchObject({
        scriptCount: 0,
        bridgeCount: 0,
        inactiveAnchorIds: [
          'completed-preview-fragment',
          'completed-preview-https',
          'completed-preview-relative',
        ],
        csp: expect.stringContaining("script-src 'none'"),
      });
    await expect(page.getByTestId('code-workspace')).toHaveCount(0);
    expect(requested.filter((url) => EDITOR_RUNTIME_CHUNK_PATTERN.test(url))).toEqual([]);
    const topUrlBeforeAnchorClicks = page.url();
    const srcdocBeforeAnchorClicks = await previewFrame.getAttribute('srcdoc');
    const staticFrame = page
      .frames()
      .find((frame) => frame.parentFrame() === page.mainFrame() && frame.url() === 'about:srcdoc');
    if (staticFrame === undefined) throw new Error('Static Preview frame was not found');
    const frameUrlBeforeAnchorClicks = staticFrame.url();
    expect(await observeStableTopUrl(page, topUrlBeforeAnchorClicks)).toBe(true);
    const requestsBeforeAnchorClicks = requested.length;
    await previewFrame.scrollIntoViewIfNeeded();
    const frameBox = await previewFrame.boundingBox();
    if (frameBox === null) throw new Error('Static Preview frame is not visible');
    for (const anchorCenterY of [24, 72, 120]) {
      await page.mouse.click(frameBox.x + 90, frameBox.y + anchorCenterY);
      expect(await observeStableTopUrl(page, topUrlBeforeAnchorClicks)).toBe(true);
      expect(staticFrame.url()).toBe(frameUrlBeforeAnchorClicks);
    }
    expect(requested.slice(requestsBeforeAnchorClicks), 'Anchor操作後の新規request').toEqual([]);
    expect(await previewFrame.getAttribute('srcdoc')).toBe(srcdocBeforeAnchorClicks);
    expect(page.url()).toBe(topUrlBeforeAnchorClicks);
    expect(staticFrame.url()).toBe(frameUrlBeforeAnchorClicks);
    await expect(page.getByText(/端末間で自動同期されません/u)).toBeVisible();
    const copyButton = page.getByRole('button', { name: 'この演習URLをコピー' });
    await copyButton.click();
    await expect(page.getByRole('status')).toHaveText('演習URLをコピーしました');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const clipboardWindow = window as Window & { __tsumucodeCopiedUrls?: string[] };
          return clipboardWindow.__tsumucodeCopiedUrls ?? [];
        }),
      )
      .toEqual([page.url()]);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (): Promise<void> => {
            throw new DOMException('clipboard denied', 'NotAllowedError');
          },
        },
      });
    });
    await copyButton.click();
    await expect(page.getByRole('alert')).toContainText('演習URLをコピーできませんでした');
    await page.getByRole('link', { name: '端末データを書き出す' }).click();
    const heading = page.getByRole('heading', { name: 'この端末の学習データ' });
    await expect(heading).toBeFocused();
    await expect(page.getByRole('button', { name: '全コースの進捗を書き出す' })).toBeVisible();
    expect(await readRuntimeErrors(page)).toEqual({
      pageErrors: [],
      unhandledRejections: [],
      consoleErrors: [],
    });
    expect(automationArtifacts).toEqual([...new Set(automationArtifacts)]);
    await context.close();
  });
}

test('教材fetch失敗後に同じRouteから再試行できる', async ({ page }, testInfo) => {
  let injectFailure = true;
  let abortedRequests = 0;
  await page.route('**/generated/content/courses/html-css.json', async (route) => {
    if (injectFailure) {
      abortedRequests += 1;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(RUNTIME_EXERCISE_PATH);
  await expect(page.getByRole('heading', { name: '教材を読み込めませんでした' })).toBeVisible();
  expect(abortedRequests).toBeGreaterThan(0);
  const consoleErrors = (await readRuntimeErrors(page)).consoleErrors;
  if (testInfo.project.name === 'chromium') {
    expect(consoleErrors.length).toBeGreaterThan(0);
    expect(new Set(consoleErrors)).toEqual(new Set(['Failed to load resource: net::ERR_FAILED']));
  } else {
    expect(consoleErrors).toEqual([]);
  }
  const expectedFailure = await takeRuntimeErrors(page);
  expect(expectedFailure.pageErrors).toEqual([]);
  expect(expectedFailure.unhandledRejections).toEqual([]);
  injectFailure = false;
  await page.getByRole('button', { name: 'もう一度読み込む' }).click();
  await page.getByTestId('code-workspace').waitFor();
  expect(await readRuntimeErrors(page)).toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
});
