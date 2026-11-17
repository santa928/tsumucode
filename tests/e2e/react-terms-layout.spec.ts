import { expect, test, type Locator, type Page } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';

/** 本文の末尾まで到達でき、意図したcode領域とは別に文が切れないことを確かめる。 */
async function expectReadableText(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const lines = Array.from(range.getClientRects());
        return (
          lines.length > 0 &&
          element.scrollWidth <= element.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1 &&
          lines.every(
            (line) =>
              line.left >= Math.max(0, box.left) - 1 &&
              line.right <= Math.min(innerWidth, box.right) + 1 &&
              line.top >= Math.max(0, box.top) - 1 &&
              line.bottom <= Math.min(innerHeight, box.bottom) + 1,
          )
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
}

const courseTitle = 'React はじめの一歩';
const description =
  '部品へ渡す値（Props）・変わる状態（State）・フォーム入力を学びます。画面要素への参照（Ref）、外部との同期（Effect）、同期処理の再利用（Custom Hook）を確かめます。読書リストを3段階で作り、温度表示の部品分け、クイズ題材の手順付き制作2工程と、別の仕様に沿う制作へ進みます。';
const projectDescription =
  '読書リストで書く範囲を広げ、温度表示の部品分けを考えます。クイズでは工程を引き継ぐ手順付き制作と、別の仕様に沿う制作を行います。後者の下書きは、手順付き制作とは別に保存します。';

for (const [name, width, height] of [
  ['desktop', 1280, 720],
  ['mobile', 390, 844],
] as const) {
  test(`react-terms-${name}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${testBasePath()}#/`);
    const card = page
      .getByRole('region', { name: '学びたいピースを選ぶ', exact: true })
      .getByRole('article', { name: courseTitle, exact: true });
    await expectReadableText(page, card.getByText(description, { exact: true }));
    await page.screenshot({ path: info.outputPath('react-home-description.png') });

    // 同名・同文のHome card（h3）を遷移先のCourse Map（h1）として扱わない。
    const map = page.getByRole('article', { name: courseTitle, exact: true }).filter({
      has: page.getByRole('heading', { level: 1, name: courseTitle, exact: true }),
    });
    await expect(map).toHaveCount(0);
    await page.goto(`${testBasePath()}#/courses/react`);
    await expectReadableText(page, map.getByText(description, { exact: true }));
    await page.screenshot({ path: info.outputPath('react-map-description.png') });
    const project = map.getByRole('region', { name: '部品を組み合わせて作品を作る', exact: true });
    await expectReadableText(page, project.getByText(projectDescription, { exact: true }));
    await page.screenshot({ path: info.outputPath('react-map-project.png') });

    await page.goto(`${testBasePath()}#/library/react`);
    await expect(
      page.getByRole('heading', { level: 1, name: `${courseTitle} スライド目次`, exact: true }),
    ).toBeVisible();
    await expectReadableText(page, page.getByText(projectDescription, { exact: true }));
    await page.screenshot({ path: info.outputPath('react-library-project.png') });

    const lesson = 'react-ch01-l01';
    for (const [id, meaning, proseMeaning, term] of [
      ['s01', '表示を返す関数', '表示のまとまりを返す関数', 'Component'],
      ['s02', '表示を書く構文', '表示を書く構文', 'JSX'],
      ['s03', '部品へ渡す値', '渡す値', 'Props'],
    ] as const) {
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${lesson}-${id}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage).toHaveAttribute('data-slide-id', `${lesson}-${id}`);
      const heading = stage.getByRole('heading', { level: 1, name: `${meaning}（${term}）` });
      await expectReadableText(page, heading);
      const paragraph = stage.locator('p').filter({ hasText: proseMeaning });
      await expectReadableText(page, paragraph);
      const text = await paragraph.innerText();
      expect(text).toContain(term);
      expect(text.indexOf(proseMeaning)).toBeLessThan(text.indexOf(term));
      const headingBox = await heading.boundingBox();
      const paragraphBox = await paragraph.boundingBox();
      expect(headingBox).not.toBeNull();
      expect(paragraphBox).not.toBeNull();
      expect(headingBox!.y + headingBox!.height).toBeLessThanOrEqual(paragraphBox!.y);
      await page.screenshot({ path: info.outputPath(`react-${id}.png`) });
    }
  });
}
