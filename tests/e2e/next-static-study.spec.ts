import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readSplitCourseArtifacts } from '../../scripts/content/readSplitCourseArtifacts';
import { readStoredProgress } from './helpers/progress';
import { expectStoredViewedSlide } from './helpers/releaseCourse';
import { testBasePath } from './helpers/testBasePath';

const course = await readSplitCourseArtifacts('dist', 'next');
const lessons = course.phases.flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons));
const base = testBasePath();

for (const width of [1280, 390]) {
  test(`Next9教材のPages静的学習・Local案内・JSON引継ぎ ${String(width)}`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(180_000);
    expect(lessons).toHaveLength(9);
    await page.setViewportSize({ width, height: 900 });
    const localRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        /__tsumucode|\/control\/|\/preview\//u.test(url.pathname) ||
        (['localhost', '127.0.0.1'].includes(url.hostname) && url.port !== '4173')
      )
        localRequests.push(request.url());
    });
    const observed = [];
    for (const lesson of lessons) {
      for (const slide of lesson.slides) {
        await page.goto(`${base}#/courses/next/lessons/${lesson.id}/slides/${slide.id}`);
        await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide.id);
        await expectStoredViewedSlide(page, lesson.id, slide.id);
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          )
          .toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      }
      const exercise = lesson.exercises[0]!;
      await page.goto(`${base}#/courses/next/lessons/${lesson.id}/exercises/${exercise.id}`);
      await expect(page.getByRole('heading', { name: exercise.title, exact: true })).toBeVisible();
      await expect(
        page.getByText('この演習はLocal学習環境で実行します', { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/全コースの進捗と下書きを書き出す/u)).toBeVisible();
      await expect(page.getByText(/Cookie・認証・Cookieによる保存は未対応/u)).toBeVisible();
      await expect(page.getByRole('button', { name: '判定する', exact: true })).toHaveCount(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      const back = page.getByRole('link', { name: '学習一覧へ戻る', exact: true });
      await back.focus();
      await expect(back).toBeFocused();
      const screenshot = info.outputPath(`${lesson.id}-${String(width)}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      observed.push({ lessonId: lesson.id, slides: lesson.slides.map(({ id }) => id), screenshot });
    }
    await page.goto(`${base}#/`);
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true })
      .click();
    const bundlePath = info.outputPath(`next-progress-${String(width)}.json`);
    await (await download).saveAs(bundlePath);
    const fresh = await browser.newContext({
      baseURL: page.url().split('#')[0]!,
      viewport: { width, height: 900 },
    });
    try {
      const imported = await fresh.newPage();
      await imported.goto('./#/');
      await imported.getByLabel('書き出した学習データを読み込む').setInputFiles({
        name: 'next-progress.json',
        mimeType: 'application/json',
        buffer: await readFile(bundlePath),
      });
      await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
      const reload = imported.waitForEvent('domcontentloaded');
      await imported.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
      await reload;
      const progress = (await readStoredProgress(imported)).courses.find(
        (item) => item['courseId'] === 'next',
      );
      expect(progress?.['lessons']).toMatchObject(
        Object.fromEntries(
          lessons.map(({ id, slides }) => [id, { viewedSlideIds: slides.map(({ id }) => id) }]),
        ),
      );
      await imported.reload();
      expect(
        (await readStoredProgress(imported)).courses.find((item) => item['courseId'] === 'next'),
      ).toEqual(progress);
    } finally {
      await fresh.close();
    }
    expect(localRequests).toEqual([]);
    await writeFile(
      info.outputPath(`next-static-study-${String(width)}.json`),
      JSON.stringify(
        {
          method: 'real-browser-pages-static-study',
          width,
          courseId: 'next',
          lessonIds: lessons.map(({ id }) => id),
          observed,
          axeViolations: 0,
          localExecutionRequests: localRequests.length,
          progressRoundTrip: 'passed',
          localHandoff: 'passed',
          serverExecution: 'not-provided-on-pages',
        },
        null,
        2,
      ) + '\n',
    );
  });
}
