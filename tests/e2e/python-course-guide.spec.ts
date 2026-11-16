import { expect, test } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';

test('Python実践とOOPの案内をHomeとコースマップに表示する', async ({ page }) => {
  const courses = [
    {
      id: 'python-practice',
      title: 'Pythonの反復とデータ処理',
      before: 'Python基礎のリスト（List）・繰り返し（for）・関数・例外を使います。',
      practice:
        '短いコードで値の変換や繰り返し、使い終えた資源の後片付けを確かめます。最後は手順に沿って、型注釈とテストを使う小さなデータ集計を作ります。',
      outside: '外部パッケージの追加や、端末のファイル操作は扱いません。',
    },
    {
      id: 'python-oop',
      title: 'PythonのClassとobjectの設計',
      before: 'Python基礎の関数と変数の範囲、Python実践のデータクラス（dataclass）を使います。',
      practice:
        '同じ計算を3種類のメソッドで比べ、クラスの組み立てと関数を変える仕組みを練習します。最後は手順に沿って小さな記録プログラムを作ります。',
      outside: '高度なメタクラスやディスクリプタの自作は扱いません。',
    },
  ];

  await page.goto(`${testBasePath()}#/`);
  for (const course of courses) {
    const card = page.getByRole('article', { name: course.title, exact: true });
    await expect(card.getByText(course.before, { exact: true })).toBeVisible();
    await expect(card.getByText(course.practice, { exact: true })).toBeVisible();
  }

  for (const course of courses) {
    await page.goto(`${testBasePath()}#/courses/${course.id}`);
    await expect(page.getByRole('heading', { level: 1, name: course.title })).toBeVisible();
    await expect(page.getByText(course.before, { exact: true })).toBeVisible();
    await expect(page.getByText(course.practice, { exact: true })).toBeVisible();
    await expect(page.getByText(course.outside, { exact: true })).toBeVisible();
  }
});
