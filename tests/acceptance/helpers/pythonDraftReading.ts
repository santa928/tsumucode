import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../../scripts/content/compileCourse';
import { expectSlideScrollReachable } from '../../e2e/helpers/slideScroll';
import { testBasePath } from '../../e2e/helpers/testBasePath';

/** Python草稿の全Slide読書と、公開一覧・core取得の境界を確認する。 */
export async function definePythonDraftReadingTests(courseRoot: string): Promise<void> {
  const { runtime: course } = await loadAuthoringCourse(courseRoot);
  const slides = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) =>
      lessons.flatMap((lesson) => lesson.slides.map((slide) => ({ lessonId: lesson.id, slide }))),
    ),
  );

  for (const narrow of [false, true]) {
    test(`${narrow ? '390px' : 'PC'}の全Slideで読書・a11y・Python coreの遅延取得を確認する`, async ({
      page,
    }, info) => {
      const coreRequests: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.includes('/python-runtime/'))
          coreRequests.push(request.url());
      });
      await page.setViewportSize(
        narrow ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      );

      // 受入用の直接URLは草稿を開けるが、公開一覧へ追加されたこととは区別する。
      for (const route of ['#/', '#/paths/python-basics']) {
        await page.goto(`${testBasePath()}${route}`);
        await expect(page.getByRole('main')).toBeVisible();
        if (route === '#/paths/python-basics')
          await expect(
            page.getByRole('heading', { name: 'Python入門の学習パス', exact: true }),
          ).toBeVisible();
        await expect(page.getByRole('link', { name: course.title })).toHaveCount(0);
      }
      for (const { lessonId, slide } of slides) {
        const slideId = slide.id;
        await test.step(slideId, async () => {
          await page.goto(
            `${testBasePath()}#/courses/${course.id}/lessons/${lessonId}/slides/${slideId}`,
          );
          const stage = page.getByTestId('slide-stage');
          await expect(stage).toHaveAttribute('data-slide-id', slideId);
          if (
            slide.blocks.some(
              ({ type }) => type === 'practice' || type === 'prediction' || type === 'image',
            )
          ) {
            await expect(
              stage.getByText(
                '図や予測の問いまで読み、本文が続くときは下へスクロールしてください。',
                { exact: true },
              ),
            ).toBeVisible();
          }
          const images = stage.getByRole('img');
          if (slide.layout === 'code-preview') await expect(images.first()).toBeVisible();
          for (let index = 0; index < (await images.count()); index++)
            await expect
              .poll(() =>
                images.nth(index).evaluate((node) => (node as HTMLImageElement).naturalWidth),
              )
              .toBeGreaterThan(0);
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
          await expectSlideScrollReachable(page, narrow);
          await page.screenshot({ path: info.outputPath(`${slideId}.png`), fullPage: true });
          if (slide.layout === 'code-preview') {
            await images.first().scrollIntoViewIfNeeded();
            await page.screenshot({
              path: info.outputPath(`${slideId}-figure.png`),
              fullPage: true,
            });
          }
        });
      }
      expect(coreRequests).toEqual([]);
    });
  }
}
