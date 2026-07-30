import { expect, type Page } from '@playwright/test';
import { testBasePath } from './testBasePath';

export const RUNTIME_EXERCISE_PATH = `${testBasePath()}#/courses/html-css/lessons/html-css-ch00-l01/exercises/html-css-ch00-l01-e01`;

export interface StoredProgressProbe {
  readonly databaseVersion: number;
  readonly recordSchemaVersion?: number;
  readonly courses: readonly Record<string, unknown>[];
  readonly drafts: readonly Record<string, unknown>[];
  readonly backups: readonly Record<string, unknown>[];
  readonly quarantined: readonly Record<string, unknown>[];
}

/** 新規Contextへschema v1の公開Course Draftを直接保存し、open-time migrationを準備する。 */
export async function seedSchemaV1Progress(page: Page): Promise<void> {
  await page.goto('generated/content/catalog.json');
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
      const opening = indexedDB.open('tsumucode-progress', 1);
      opening.onerror = () => {
        reject(opening.error ?? new Error('database open failed'));
      };
      opening.onupgradeneeded = () => {
        const next = opening.result;
        next.createObjectStore('courses', { keyPath: 'courseId' });
        next.createObjectStore('drafts', { keyPath: 'key' });
        next.createObjectStore('backups', { keyPath: 'id' });
      };
      opening.onsuccess = () => {
        resolve(opening.result);
      };
    });
    try {
      const transaction = database.transaction(['drafts'], 'readwrite');
      transaction.objectStore('drafts').put({
        key: 'html-css:workspace-first-heading',
        courseId: 'html-css',
        lessonId: 'lesson-first-heading',
        exerciseId: 'exercise-first-heading',
        workspaceId: 'workspace-first-heading',
        contentRevision: '2026-07-10.1',
        files: { 'index.html': '<main><h1>移行済み</h1></main>' },
        selectedFile: 'index.html',
        cursorOffset: 9,
        validationHistory: [],
        revealedHintIds: ['hint-h1-1'],
        reviewSlideId: 'slide-html-role',
        reviewScrollOffset: 120,
        updatedAt: '2026-07-01T00:00:00.000Z',
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('schema v1 seed transaction failed'));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('schema v1 seed transaction aborted'));
        };
      });
    } finally {
      database.close();
    }
  });
}

/** Mobile read-only Preview用に現行schemaの完了済みCourseとpassing snapshotを保存する。 */
export async function seedCompletedProgress(page: Page): Promise<void> {
  await page.goto('generated/content/catalog.json');
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
      const files = {
        'index.html':
          '<main><h1>わたしの学習ノート</h1>' +
          '<nav aria-label="参考リンク" style="position:fixed;left:0;top:0;width:180px;height:144px">' +
          '<a id="completed-preview-https" href="https://example.com/docs" style="display:block;width:180px;height:48px">HTTPS</a>' +
          '<a id="completed-preview-relative" href="guide/page.html?from=preview" style="display:block;width:180px;height:48px">Relative</a>' +
          '<a id="completed-preview-fragment" href="#completed-preview-part" style="display:block;width:180px;height:48px">Fragment</a>' +
          '</nav><section id="completed-preview-part">参考</section></main>',
        'styles.css': 'body { background-color: #fffaf0; }',
      };
      const transaction = database.transaction(['courses', 'drafts', 'metadata'], 'readwrite');
      transaction.objectStore('courses').put({
        courseId: 'html-css',
        contentRevision: '2026-07-29.1',
        lessons: {
          'html-css-ch00-l01': {
            lessonId: 'html-css-ch00-l01',
            viewedSlideIds: [
              'html-css-ch00-l01-s01',
              'html-css-ch00-l01-s02',
              'html-css-ch00-l01-s03',
              'html-css-ch00-l01-s04',
            ],
            currentSlideId: 'html-css-ch00-l01-s04',
            passedExerciseIds: ['html-css-ch00-l01-e01'],
            passedChecklistItemIds: [],
            passedRuleIds: ['html-css-ch00-l01-e01-r01', 'html-css-ch00-l01-e01-r02'],
            passedViewportIds: ['desktop-1280'],
            currentComplete: true,
            firstCompletedAt: now,
          },
        },
        currentLessonId: 'html-css-ch00-l01',
        currentChapterId: 'html-css-ch00',
        currentComplete: true,
        firstCompletedAt: now,
        updatedAt: now,
      });
      transaction.objectStore('drafts').put({
        key: 'html-css:html-css-ch00-l01-e01',
        courseId: 'html-css',
        lessonId: 'html-css-ch00-l01',
        exerciseId: 'html-css-ch00-l01-e01',
        workspaceId: 'html-css-ch00-l01-e01',
        contentRevision: '2026-07-29.1',
        editRevision: 1,
        files,
        selectedFile: 'index.html',
        cursors: { 'index.html': { anchor: 20, head: 20 } },
        validationHistory: [],
        revealedHintIds: [],
        lastPassingSnapshots: {
          'html-css-ch00-l01-e01': {
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

/** 現在DBのversion、schema metadata、主要store recordを一貫したprobeへ読む。 */
export async function readStoredProgress(page: Page): Promise<StoredProgressProbe> {
  return page.evaluate(async () => {
    const requestResult = <Value>(request: IDBRequest<Value>): Promise<Value> =>
      new Promise<Value>((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('IndexedDB request failed'));
        };
      });
    const transactionDone = (transaction: IDBTransaction): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('IndexedDB failed'));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('IndexedDB aborted'));
        };
      });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tsumucode-progress');
      opening.onsuccess = () => {
        resolve(opening.result);
      };
      opening.onerror = () => {
        reject(opening.error ?? new Error('database open failed'));
      };
    });
    try {
      const names = ['metadata', 'courses', 'drafts', 'backups', 'quarantine'].filter((name) =>
        database.objectStoreNames.contains(name),
      );
      const transaction = database.transaction(names, 'readonly');
      const readAll = async (name: string): Promise<readonly Record<string, unknown>[]> => {
        if (!database.objectStoreNames.contains(name)) return [];
        return requestResult(transaction.objectStore(name).getAll()) as Promise<
          readonly Record<string, unknown>[]
        >;
      };
      const metadata: unknown = database.objectStoreNames.contains('metadata')
        ? await requestResult(transaction.objectStore('metadata').get('recordSchemaVersion'))
        : undefined;
      const courses = await readAll('courses');
      const drafts = await readAll('drafts');
      const backups = await readAll('backups');
      const quarantined = await readAll('quarantine');
      await transactionDone(transaction);
      const recordSchemaVersion =
        typeof metadata === 'object' &&
        metadata !== null &&
        typeof (metadata as { value?: unknown }).value === 'number'
          ? (metadata as { value: number }).value
          : undefined;
      return {
        databaseVersion: database.version,
        ...(recordSchemaVersion === undefined ? {} : { recordSchemaVersion }),
        courses,
        drafts,
        backups,
        quarantined,
      };
    } finally {
      database.close();
    }
  });
}

/** CodeMirrorの現在選択中Document textを行要素間の改行も含めて返す。 */
export async function editorText(page: Page): Promise<string> {
  return page
    .locator('.cm-content .cm-line')
    .evaluateAll((lines) => lines.map((line) => line.textContent).join('\n'));
}

/** CodeMirror全体を置換し、期待値がReact stateへ反映されるまで待つ。 */
export async function replaceEditorText(page: Page, value: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(value);
  await expect
    .poll(async () => (await editorText(page)).replaceAll('\n', ''))
    .toContain(value.replaceAll('\n', ''));
}

/** SaveStatusが保存済みへ戻るまで固定sleepなしで待つ。 */
export async function waitForDraftSaved(page: Page): Promise<void> {
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
}

/** 指定SourceがIndexedDBのworkspace Draftへ保存されるまで待ち、Editor DOMだけの先行更新を除外する。 */
export async function waitForStoredDraftContent(page: Page, expected: string): Promise<void> {
  await expect
    .poll(async () => {
      const stored = await readStoredProgress(page);
      return stored.drafts.some((draft) => {
        const files = draft['files'];
        return (
          typeof files === 'object' &&
          files !== null &&
          Object.values(files).some((content) => content === expected)
        );
      });
    })
    .toBe(true);
  await waitForDraftSaved(page);
}
