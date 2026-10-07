import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testBasePath } from '../e2e/helpers/testBasePath';
import { expectSlideScrollReachable } from '../e2e/helpers/slideScroll';

const { runtime: course } = await loadAuthoringCourse('content/react');
const previews = course.phases.flatMap(({ chapters }) =>
  chapters.flatMap(({ lessons }) =>
    lessons.flatMap((lesson) =>
      lesson.slides
        .filter(({ layout }) => layout === 'code-preview')
        .map((slide) => ({ lessonId: lesson.id, slideId: slide.id })),
    ),
  ),
);

for (const narrow of [false, true]) {
  test(`${narrow ? '390px' : 'PC'}で追加した全コード・概念図を読める`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '図の内容・レイアウト確認はChromiumを使う。');
    test.setTimeout(240_000);
    await page.setViewportSize(narrow ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    for (const { lessonId, slideId } of previews) {
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lessonId}/slides/${slideId}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage).toHaveAttribute('data-slide-id', slideId);
      const image = stage.getByRole('img');
      await expect(image).toHaveCount(1);
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectSlideScrollReachable(page, narrow);
      await page.screenshot({ path: info.outputPath(`${slideId}.png`), fullPage: true });
    }
  });
}
