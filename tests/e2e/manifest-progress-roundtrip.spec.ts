import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { CourseCatalogV3Schema, CourseIndexSchema } from '../../src/core/content/deliverySchema';
import { canonicalJson, sha256 } from '../../src/core/persistence/canonicalJson';
import type {
  CourseProgress,
  ExerciseDraft,
  RepositorySnapshot,
} from '../../src/core/persistence/contracts';
import { hashValue } from '../../scripts/release/v2/identity';
import { readStoredProgress } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const authoringRoot = existsSync('.release-v2/authoring-public/generated/content/catalog-v3.json')
  ? '.release-v2/authoring-public'
  : 'public';
const catalog = CourseCatalogV3Schema.parse(
  JSON.parse(
    readFileSync(path.join(authoringRoot, 'generated/content/catalog-v3.json'), 'utf8'),
  ) as unknown,
);
const indexes = catalog.courses.map((entry) =>
  CourseIndexSchema.parse(
    JSON.parse(readFileSync(path.join(authoringRoot, entry.indexPath), 'utf8')) as unknown,
  ),
);
const now = '2026-10-28T00:00:00.000Z';
function syntheticSnapshot(): RepositorySnapshot {
  const courses: Record<string, CourseProgress> = {},
    drafts: Record<string, ExerciseDraft> = {};
  for (const index of indexes) {
    const lessons: Record<string, CourseProgress['lessons'][string]> = {};
    for (const lesson of index.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons }) => lessons),
    )) {
      lessons[lesson.id] = {
        lessonId: lesson.id,
        viewedSlideIds: [],
        passedExerciseIds: [],
        passedChecklistItemIds: [],
        passedRuleIds: [],
        passedViewportIds: [],
        currentComplete: false,
      };
      for (const exercise of lesson.exercises) {
        const source = 'synthetic saved workspace: ' + index.id + '/' + exercise.workspaceId;
        drafts[index.id + ':' + exercise.workspaceId] = {
          courseId: index.id,
          lessonId: lesson.id,
          exerciseId: exercise.id,
          workspaceId: exercise.workspaceId,
          contentRevision: index.revision,
          editRevision: 1,
          files: { 'saved.txt': source },
          selectedFile: 'saved.txt',
          cursors: { 'saved.txt': { anchor: 0, head: 0 } },
          validationHistory: [],
          revealedHintIds: [],
          lastPassingSnapshots: {},
          updatedAt: now,
        };
      }
    }
    courses[index.id] = {
      courseId: index.id,
      contentRevision: index.revision,
      lessons,
      currentComplete: false,
      updatedAt: now,
    };
  }
  return { schemaVersion: 2, courses, drafts, quarantined: [] };
}
async function importJson(page: Page, source: string) {
  await page.goto(testBasePath() + '#/');
  const input = page.getByLabel('書き出した学習データを読み込む');
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: 'synthetic-manifest-progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await expect(page.getByRole('region', { name: '読み込み差分' })).toBeVisible();
  const reload = page.waitForEvent('domcontentloaded');
  await page.getByRole('button', { name: 'この内容を読み込む' }).click();
  await reload;
}
async function assertActualSnapshot(page: Page, expected: RepositorySnapshot) {
  const stored = await readStoredProgress(page);
  expect(stored.quarantined).toEqual([]);
  expect(stored.courses.map((course) => course['courseId']).sort()).toEqual(
    Object.keys(expected.courses).sort(),
  );
  for (const course of Object.values(expected.courses))
    expect(stored.courses.find((row) => row['courseId'] === course.courseId)).toMatchObject({
      ...course,
    });
  expect(stored.drafts.length).toBe(Object.keys(expected.drafts).length);
  for (const draft of Object.values(expected.drafts))
    expect(
      stored.drafts.find(
        (row) => row['courseId'] === draft.courseId && row['workspaceId'] === draft.workspaceId,
      ),
    ).toMatchObject({ ...draft });
  return stored;
}

test('manifestの全Lesson・workspaceと公開対象外の既知進捗を実IndexedDBからExport・再Importする', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90_000);
  if (process.env['TSUMUCODE_RELEASE_V2'] === '1') {
    const publicCatalog = CourseCatalogV3Schema.parse(
      JSON.parse(readFileSync('dist/generated/content/catalog-v3.json', 'utf8')) as unknown,
    );
    expect(
      publicCatalog.courses.every(({ publicationStatus }) => publicationStatus === 'published'),
    ).toBe(true);
    expect(publicCatalog.progressCatalog).toBeDefined();
  }
  const snapshot = syntheticSnapshot();
  const unsigned = { ...snapshot, appVersion: '0.1.0', exportedAt: now };
  await importJson(
    page,
    JSON.stringify({
      ...unsigned,
      integrity: { algorithm: 'SHA-256', digest: await sha256(canonicalJson(unsigned)) },
    }),
  );
  await assertActualSnapshot(page, snapshot);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す' }).click();
  const file = info.outputPath('all-known-progress.json');
  await (await download).saveAs(file);
  const exported = await readFile(file, 'utf8');
  const context = await browser.newContext();
  try {
    const imported = await context.newPage();
    await importJson(imported, exported);
    const observed = await assertActualSnapshot(imported, snapshot);
    const rows = indexes
      .filter(({ publicationStatus }) => publicationStatus === 'published')
      .flatMap((index) =>
        index.phases
          .flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
          .map((lesson) => ({
            key: [index.id, lesson.id, 'persistence'].join('/'),
            inputDigest: hashValue({
              completion: lesson.completion,
              workspaces: lesson.exercises.map(({ id, workspaceId }) => ({ id, workspaceId })),
              migrations: index.progressMigrations,
            }),
          })),
      );
    await info.attach('release-persistence-v1', {
      body: JSON.stringify({
        rows,
        knownCourses: observed.courses.map((course) => course['courseId']),
        workspaces: observed.drafts.length,
        synthetic: true,
      }),
      contentType: 'application/json',
    });
  } finally {
    await context.close();
  }
});
