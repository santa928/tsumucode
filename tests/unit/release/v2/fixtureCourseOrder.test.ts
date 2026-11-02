// @vitest-environment node
import { expect, it } from 'vitest';
import { orderFixtureCourses } from '../../../e2e/helpers/fixtureCourseOrder';

it('新しいCourse名でもcompilerを使う演習を先に登録し、同じ種類のSource順を保つ', () => {
  const rows = [
    { entry: { id: 'future-a' }, index: { runnerId: 'html-css' }, label: 'html' },
    { entry: { id: 'future-b' }, index: { runnerId: 'typescript' }, label: 'typed' },
    { entry: { id: 'future-c' }, index: { runnerId: 'javascript' }, label: 'script' },
    { entry: { id: 'future-d' }, index: { runnerId: 'react' }, label: 'react' },
    { entry: { id: 'future-e' }, index: { runnerId: 'tailwind' }, label: 'css-compiler' },
  ];
  expect(orderFixtureCourses(rows).map(({ label }) => label)).toEqual([
    'typed',
    'react',
    'css-compiler',
    'html',
    'script',
  ]);
  expect(rows.map(({ label }) => label)).toEqual([
    'html',
    'typed',
    'script',
    'react',
    'css-compiler',
  ]);
});

it('並べ替えでCourse・演習・fixtureの入力を複製・省略・変更しない', () => {
  const rows = [
    { entry: { id: 'future-html' }, index: { runnerId: 'html-css', exercises: ['a', 'b'] } },
    { entry: { id: 'future-typed' }, index: { runnerId: 'typescript', exercises: ['c'] } },
  ];
  const before = JSON.stringify(rows);
  const ordered = orderFixtureCourses(rows);
  expect(ordered).toHaveLength(rows.length);
  expect(new Set(ordered)).toEqual(new Set(rows));
  expect(ordered[0]).toBe(rows[1]);
  expect(ordered[1]).toBe(rows[0]);
  expect(JSON.stringify(rows)).toBe(before);
});
