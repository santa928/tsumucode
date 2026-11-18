// @vitest-environment node
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';

it('React初回の表示工程票だけで編集対象・指定値・確認順が分かる', async () => {
  const { runtime: course, exercises } = await loadAuthoringCourse('content/react');
  const id = 'react-ch01-l01-e01';
  const authored = exercises.find((exercise) => exercise.id === id)!;
  const published = course.phases
    .flatMap((phase) => phase.chapters)
    .flatMap((chapter) => chapter.lessons)
    .flatMap((lesson) => lesson.exercises)
    .find((exercise) => exercise.id === id)!;
  const promptRule = authored.validationRules.find((rule) => rule.id === `${id}-r01`)!;
  expect(promptRule.assertion).toMatchObject({
    kind: 'text',
    operator: 'equals',
    expected: 'HTMLが受け持つものは？',
  });
  for (const exercise of [authored, published]) {
    const step = exercise.steps[0]!;
    expect(step.file).toBe('main.tsx');
    expect(step.target).toContain('prompt');
    expect(step.change).toContain('文字列「HTMLが受け持つものは？」');
    expect(step.observe).toMatch(/プレビューを更新.*型の案内.*見出し.*判定する/u);
    expect(step.validationRuleIds).toContain(promptRule.id);
  }
});

it('React初回の用語は意味から正式名へ示し、入口は制作の支援範囲を説明する', async () => {
  const { runtime: course } = await loadAuthoringCourse('content/react');
  const lesson = course.phases
    .flatMap((phase) => phase.chapters)
    .flatMap((chapter) => chapter.lessons)
    .find((lesson) => lesson.id === 'react-ch01-l01')!;
  for (const [id, titleMeaning, proseMeaning, term] of [
    ['s01', '表示を返す関数', '表示のまとまりを返す関数', 'Component'],
    ['s02', '表示を書く構文', '表示を書く構文', 'JSX'],
    ['s03', '部品へ渡す値', '渡す値', 'Props'],
  ] as const) {
    const slide = lesson.slides.find((slide) => slide.id === `react-ch01-l01-${id}`)!;
    expect(slide.title).toBe(`${titleMeaning}（${term}）`);
    const paragraph = slide.blocks.find((block) => block.type === 'paragraph')!;
    expect(paragraph.text).toContain(proseMeaning);
    expect(paragraph.text).toContain(term);
    expect(paragraph.text.indexOf(proseMeaning)).toBeLessThan(paragraph.text.indexOf(term));
  }
  expect(course.description).toContain('手順付き制作2工程');
  expect(course.description).toContain('別の仕様に沿う制作');
  expect(course.description).not.toMatch(/Guided|Capstone|Brief/u);
  expect(course.phases[1]!.description).toContain('下書きは、手順付き制作とは別に保存');
});
