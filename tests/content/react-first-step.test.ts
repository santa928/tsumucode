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
