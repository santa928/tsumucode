import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { z } from 'zod';
import { BuildIdentitySchema, InventorySchema } from '../../../scripts/release/v2/schema';
import { planPublishedOperations } from '../../../scripts/release/v2/publishedOperations';
import { hashValue } from '../../../scripts/release/v2/identity';
import { readSplitCourseArtifacts } from '../../../scripts/content/readSplitCourseArtifacts';
import {
  loadAuthoringCourse,
  type AuthoringExercise,
} from '../../../scripts/content/compileCourse';
import { pythonFixedFixtures } from '../../../src/core/runtime/pythonFixedFixtures.mjs';
import { readStoredProgress, waitForStoredDraftContent } from '../helpers/progress';
// Normal pre-deploy Browser suites do not accidentally run this remote-only suite.
if (process.env['TSUMUCODE_PUBLISHED_OPERATIONS'] === '1') {
  const candidate = BuildIdentitySchema.parse(
    JSON.parse(readFileSync('.release-v2/candidate.json', 'utf8')) as unknown,
  );
  const snapshot = z
    .object({ inventory: InventorySchema })
    .parse(JSON.parse(readFileSync('.release-v2/preparation.json', 'utf8')) as unknown);
  const plan = planPublishedOperations(snapshot.inventory);
  const courses = new Map<string, ReturnType<typeof readSplitCourseArtifacts>>();
  const course = (id: string) => {
    if (!courses.has(id)) courses.set(id, readSplitCourseArtifacts('dist', id));
    return courses.get(id)!;
  };
  async function proof(page: Page, info: TestInfo, key: string) {
    const url = new URL(page.url());
    url.hash = '';
    url.search = '';
    await info.attach('public-operation', {
      contentType: 'application/json',
      body: Buffer.from(
        JSON.stringify({
          key,
          candidateDigest: hashValue(candidate),
          artifactDigest: candidate.artifactDigest,
          siteUrl: url.href,
        }),
      ),
    });
  }
  async function writeExercise(page: Page, exercise: AuthoringExercise, solution: boolean) {
    const files = new Map(
      [...exercise.files, ...(solution ? exercise.solutionFiles : [])].map((file) => [
        file.path,
        file,
      ]),
    );
    for (const file of files.values()) {
      const original = exercise.files.find((row) => row.path === file.path);
      if (!original) throw Error('Public operation requires actual UI file creation: ' + file.path);
      if (!original.editable) {
        expect(file.content).toBe(original.content);
        continue;
      }
      await page.getByRole('tab', { name: file.path, exact: true }).click();
      const editor = page.getByRole('textbox', {
        name: file.path + ' のコードエディター',
        exact: true,
      });
      await editor.click();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.insertText(file.content);
      // CodeMirror virtualizes long files; IndexedDB is the full saved-byte oracle.
      await waitForStoredDraftContent(page, file.content);
    }
  }
  for (const target of plan.targets)
    test(
      target.key,
      { annotation: { type: 'public-operation', description: target.key } },
      async ({ page, browser }, info) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        if (target.kind === 'launch') {
          await page.goto('./#/');
          await expect(page.getByRole('banner')).toBeVisible();
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          const catalog = await page.request.get('generated/content/catalog-v3.json');
          expect(catalog.ok()).toBe(true);
          const value = z
            .object({
              courses: z.array(
                z.object({ id: z.string(), publicationStatus: z.literal('published') }),
              ),
            })
            .parse((await catalog.json()) as unknown);
          expect(value.courses.map((row) => row.id).sort()).toEqual(
            snapshot.inventory.courses
              .filter((row) => row.publicationStatus === 'published')
              .map((row) => row.id)
              .sort(),
          );
          const reading = plan.targets.find((row) => row.kind === 'reading-resume')!;
          const model = await course(reading.courseId!);
          const lesson = model.phases
            .flatMap((row) => row.chapters.flatMap((chapter) => chapter.lessons))
            .find((row) => row.id === reading.lessonId)!;
          const slide = lesson.slides[0]!;
          await page
            .getByRole('article', { name: model.title, exact: true })
            .getByRole('link', { name: model.title + '：最初のピースを置く', exact: true })
            .click();
          await expect
            .poll(() => new URL(page.url()).hash)
            .toBe('#/courses/' + model.id + '/lessons/' + lesson.id + '/slides/' + slide.id);
          await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide.id);
        } else if (target.kind === 'reading-resume') {
          await page.setViewportSize({ width: 390, height: 400 });
          await page.goto(
            './#/library/' + target.courseId! + '/lessons/' + target.lessonId! + '/read',
          );
          await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
          });
          const toc = page
            .getByRole('navigation', { name: 'このレッスンの目次' })
            .getByRole('link')
            .last();
          await expect(toc).toBeVisible();
          await toc.click();
          const share = page.getByRole('textbox', { name: '読書位置のURL', exact: true });
          await expect(share).toHaveValue(/slide=/u);
          const value = await share.inputValue(),
            slide = new URLSearchParams(new URL(value, page.url()).hash.split('?')[1]).get('slide');
          expect(slide).toBeTruthy();
          const saved = () =>
            page.evaluate(
              ({ courseId, lessonId }) => {
                const data = JSON.parse(localStorage.getItem('tsumucode-reading-v1') ?? '{}') as {
                  positions?: { courseId: string; lessonId: string; slideId: string }[];
                };
                return data.positions?.find(
                  (row) => row.courseId === courseId && row.lessonId === lessonId,
                )?.slideId;
              },
              { courseId: target.courseId!, lessonId: target.lessonId! },
            );
          await expect.poll(saved).toBe(slide);
          const home = page.getByRole('banner').getByRole('link', { name: '教材を選ぶ' });
          await home.focus();
          await home.press('Enter');
          await expect(
            page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' }),
          ).toBeVisible();
          await page.reload();
          await page.getByRole('link', { name: '解説を読む', exact: true }).click();
          const resume = page.locator(
            'a[href*="/library/' +
              target.courseId! +
              '/lessons/' +
              target.lessonId! +
              '/read?slide="]',
          );
          await expect(resume).toHaveCount(1);
          await resume.click();
          await expect(page.locator('[data-reading-section="' + slide! + '"]')).toBeInViewport();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        } else if (target.kind === 'progress-transfer') {
          const reading = plan.targets.find((row) => row.kind === 'reading-resume')!;
          const model = await course(reading.courseId!),
            lesson = model.phases
              .flatMap((row) => row.chapters.flatMap((chapter) => chapter.lessons))
              .find((row) => row.id === reading.lessonId)!;
          const slide = lesson.slides[0]!;
          await page.goto(
            './#/courses/' + model.id + '/lessons/' + lesson.id + '/slides/' + slide.id,
          );
          await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide.id);
          await expect
            .poll(async () => JSON.stringify((await readStoredProgress(page)).courses))
            .toContain(slide.id);
          const editing = plan.targets.find((row) => row.kind === 'grade-persist');
          if (!editing) throw Error('No public editable workspace for draft transfer');
          const full = await loadAuthoringCourse(path.join('content', editing.courseId!));
          const exercise = full.exercises.find((row) => row.id === editing.exerciseId)!;
          const file = exercise.files.find((row) => row.editable && row.content.trim().length > 0);
          if (!file) throw Error('No nonempty public editable file for draft transfer');
          const route =
            './#/courses/' +
            editing.courseId! +
            '/lessons/' +
            editing.lessonId! +
            '/exercises/' +
            editing.exerciseId!;
          const draftContent = file.content + '\n';
          await page.goto(route);
          await page.getByRole('tab', { name: file.path, exact: true }).click();
          const editor = page.getByRole('textbox', {
            name: file.path + ' のコードエディター',
            exact: true,
          });
          await editor.click();
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
          await page.keyboard.insertText(draftContent);
          await waitForStoredDraftContent(page, draftContent);
          await page.goto('./#/');
          const before = await readStoredProgress(page);
          expect(before.drafts.length).toBeGreaterThan(0);
          const transferred = before.drafts.find(
            (row) =>
              row['courseId'] === editing.courseId && row['workspaceId'] === exercise.workspaceId,
          );
          expect(z.record(z.string(), z.string()).parse(transferred?.['files'])[file.path]).toBe(
            draftContent,
          );
          const download = page.waitForEvent('download');
          await page
            .getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true })
            .click();
          const downloadPath = info.outputPath('synthetic-public-progress.json');
          await (await download).saveAs(downloadPath);
          const bytes = await readFile(downloadPath);
          const baseURL = info.project.use.baseURL;
          if (typeof baseURL !== 'string') throw Error('Missing public operation base URL');
          const fresh = await browser.newContext({ baseURL });
          try {
            const imported = await fresh.newPage();
            await imported.goto('./#/');
            const input = imported.getByLabel('書き出した学習データを読み込む');
            await expect(input).toBeEnabled();
            await input.setInputFiles({
              name: 'public-progress.json',
              mimeType: 'application/json',
              buffer: bytes,
            });
            await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
            const reload = imported.waitForEvent('domcontentloaded');
            await imported.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
            await reload;
            const after = await readStoredProgress(imported);
            expect(after.courses).toEqual(before.courses);
            expect(after.drafts).toEqual(before.drafts);
            await imported.goto(route);
            await imported.getByRole('tab', { name: file.path, exact: true }).click();
            const restoredEditor = imported.getByRole('textbox', {
              name: file.path + ' のコードエディター',
              exact: true,
            });
            await expect(restoredEditor).toBeVisible();
            await restoredEditor.focus();
            await imported.keyboard.press(
              process.platform === 'darwin' ? 'Meta+End' : 'Control+End',
            );
            await expect(restoredEditor).toContainText(
              draftContent.trimEnd().split('\n').filter(Boolean).at(-1)!,
            );
            await imported.goto('./#/');
            await expect(
              imported.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' }),
            ).toBeVisible();
            const beforeTamper = await readStoredProgress(imported);
            const bad = z
              .record(z.string(), z.unknown())
              .parse(JSON.parse(bytes.toString('utf8')) as unknown);
            bad['appVersion'] = 'synthetic-tampered-version';
            await imported.getByLabel('書き出した学習データを読み込む').setInputFiles({
              name: 'bad-public-progress.json',
              mimeType: 'application/json',
              buffer: Buffer.from(JSON.stringify(bad)),
            });
            await expect(imported.getByRole('alert')).toBeVisible();
            const unchanged = await readStoredProgress(imported);
            expect(unchanged.courses).toEqual(beforeTamper.courses);
            expect(unchanged.drafts).toEqual(beforeTamper.drafts);
          } finally {
            await fresh.close();
          }
        } else {
          const full = await loadAuthoringCourse(path.join('content', target.courseId!)),
            exercise = full.exercises.find((row) => row.id === target.exerciseId)!;
          const lesson = (await course(target.courseId!)).phases
            .flatMap((row) => row.chapters.flatMap((chapter) => chapter.lessons))
            .find((row) => row.id === target.lessonId)!;
          const requests: string[] = [];
          if (target.kind === 'local-guide')
            page.on('request', (request) => {
              const url = new URL(request.url());
              if (/__tsumucode|\/control\/|\/preview\//u.test(url.pathname))
                requests.push(url.href);
            });
          const route =
            './#/courses/' +
            target.courseId! +
            '/lessons/' +
            target.lessonId! +
            '/exercises/' +
            target.exerciseId!;
          await page.goto(route);
          if (target.kind === 'local-guide') {
            await expect(
              page.getByText('この演習はLocal学習環境で実行します', { exact: true }),
            ).toBeVisible();
            await expect(page.getByRole('button', { name: '判定する', exact: true })).toHaveCount(
              0,
            );
            await expect(
              page.getByRole('link', { name: 'READMEのLocal起動手順', exact: true }),
            ).toHaveAttribute('href', /^https:\/\/github\.com\//u);
            expect(requests).toEqual([]);
            expect(lesson.slides.length).toBeGreaterThan(0);
          } else {
            await expect(page.locator('.cm-content').first()).toBeVisible();
            const draft = async () =>
              (await readStoredProgress(page)).drafts.find(
                (row) =>
                  row['courseId'] === target.courseId &&
                  row['workspaceId'] === exercise.workspaceId,
              );
            const grade = async (pass: boolean) => {
              if (exercise.runtime?.kind === 'python') {
                const input = page.getByLabel('実行前の入力（1行につきinput 1回）');
                if (await input.isVisible())
                  await input.fill(
                    (pythonFixedFixtures(exercise.runtime.profile)[0]?.inputLines ?? []).join('\n'),
                  );
              }
              const count = z
                .array(z.unknown())
                .parse((await draft())?.['validationHistory'] ?? []).length;
              await page.getByRole('button', { name: '判定する', exact: true }).click();
              const status = expect.poll(
                async () => {
                  const history = z
                    .array(z.object({ status: z.string() }))
                    .parse((await draft())?.['validationHistory'] ?? []);
                  if (history.length > count) return 'graded-' + history.at(-1)!.status;
                  if (
                    !pass &&
                    (target.runtimeKind === 'typescript' || target.runtimeKind === 'react') &&
                    (await page
                      .getByText('型を確認してください。まだ実行・採点していません。', {
                        exact: true,
                      })
                      .isVisible()) &&
                    (await page.getByRole('alert').isVisible())
                  )
                    return 'compile-blocked';
                  return 'pending';
                },
                { timeout: 45000 },
              );
              if (pass) await status.toBe('graded-pass');
              else
                await status.toMatch(/^(?:graded-incomplete|graded-code-error|compile-blocked)$/u);
              if (pass)
                await expect(
                  page.getByRole('heading', {
                    name: /^(?:できました|ピースがはまりました|追加練習を確かめました)$/u,
                  }),
                ).toBeVisible();
              const dialog = page.getByRole('dialog', { name: '判定結果' });
              if (await dialog.isVisible()) await page.keyboard.press('Escape');
            };
            await writeExercise(page, exercise, false);
            await grade(false);
            await writeExercise(page, exercise, true);
            await grade(true);
            // Completed projects navigate to their completion page. Reopen the real exercise first.
            await page.goto(route);
            await expect(page.locator('.cm-content').first()).toBeVisible();
            await page.reload();
            for (const file of new Map(
              [...exercise.files, ...exercise.solutionFiles].map((row) => [row.path, row]),
            ).values()) {
              await page.getByRole('tab', { name: file.path, exact: true }).click();
              if (file.editable)
                await expect
                  .poll(
                    async () =>
                      z.record(z.string(), z.string()).parse((await draft())?.['files'] ?? {})[
                        file.path
                      ],
                  )
                  .toBe(file.content);
              const editor = page.getByRole('textbox', {
                name: file.path + ' のコードエディター',
                exact: true,
              });
              await expect(editor).toBeVisible();
              await editor.focus();
              await page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
              const tail = file.content.trimEnd().split('\n').filter(Boolean).at(-1);
              if (tail) await expect(editor).toContainText(tail);
            }
          }
        }
        expect(errors).toEqual([]);
        await proof(page, info, target.key);
      },
    );
}
