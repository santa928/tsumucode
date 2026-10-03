// @vitest-environment node
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCourse, type CompiledCourseArtifacts } from '../../scripts/content/compileCourse';
import {
  javascriptLearnerContentSha256,
  javascriptLearnerContentSha256V1,
} from '../../scripts/release/javascriptLessonEvaluation';
import type { Lesson } from '../../src/core/content/types';

let course: CompiledCourseArtifacts;
let lesson: Lesson;
beforeAll(async () => {
  course = await compileCourse(path.resolve('content/javascript'));
  lesson = course.runtime.phases
    .flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
    .find((lesson) => lesson.slides.some(({ assets }) => assets.length > 0))!;
});

describe('初学者評価の教材入力', () => {
  it('新教材の追加による次リンク・workspace内部変更で既済教材をリセットしない', () => {
    const changed = structuredClone(lesson);
    changed.nextLessonId = 'new-lesson';
    changed.prerequisiteLessonIds = ['new-prerequisite'];
    changed.exercises[0]!.workspaceId = 'new-workspace';
    expect(javascriptLearnerContentSha256(changed, course.runtime.glossary, course.assets)).toBe(
      javascriptLearnerContentSha256(lesson, course.runtime.glossary, course.assets),
    );
  });
  it('採点rule ID/step/checklist/completion参照変更で教材評価を再開始しない', () => {
    const lessons = course.runtime.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons }) => lessons),
    );
    for (const kind of ['standard', 'guided-project', 'capstone']) {
      const original = lessons.find((lesson) => lesson.kind === kind)!;
      const changed = structuredClone(original);
      for (const exercise of changed.exercises) {
        exercise.validationRules.forEach((rule, index) => {
          rule.id = `renamed-rule-${String(index)}`;
        });
        exercise.steps.forEach((step) => {
          step.validationRuleIds = ['renamed-rule'];
        });
      }
      if (changed.kind !== 'standard')
        changed.project.checklist.forEach((item) => {
          item.ruleIds = ['renamed-rule'];
        });
      if (changed.completion.kind === 'capstone')
        changed.completion.requiredRuleIds = ['renamed-rule'];
      expect(javascriptLearnerContentSha256(changed, course.runtime.glossary, course.assets)).toBe(
        javascriptLearnerContentSha256(original, course.runtime.glossary, course.assets),
      );
    }
  });
  it('Runtime/採点内部の変更を初学者教材評価の再開始条件にしない', () => {
    const changed = structuredClone(lesson);
    const runtime = changed.exercises[0]!.runtime;
    if (runtime?.kind !== 'javascript') throw new Error('JavaScript Runtimeが必要です');
    runtime.primaryOutput = runtime.primaryOutput === 'preview' ? 'console' : 'preview';
    expect(javascriptLearnerContentSha256(changed, course.runtime.glossary, course.assets)).toBe(
      javascriptLearnerContentSha256(lesson, course.runtime.glossary, course.assets),
    );
  });
  it('必須と任意の課題が入れ替われば可視区分のhashを更新する', () => {
    const original = course.runtime.phases
      .flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
      .find((lesson) => lesson.kind === 'standard' && lesson.exercises.length > 1)!;
    if (original.completion.kind !== 'standard') throw new Error('Standard Lessonが必要です');
    const changed = structuredClone(original);
    if (changed.completion.kind !== 'standard') throw new Error('Standard Lessonが必要です');
    const requiredIds = original.completion.requiredExerciseIds;
    const optional = original.exercises.find(({ id }) => !requiredIds.includes(id));
    if (!optional) throw new Error('任意Exerciseが必要です');
    changed.completion.requiredExerciseIds = [optional.id];
    expect(
      javascriptLearnerContentSha256(changed, course.runtime.glossary, course.assets),
    ).not.toBe(javascriptLearnerContentSha256(original, course.runtime.glossary, course.assets));
    expect(javascriptLearnerContentSha256V1(changed, course.runtime.glossary, course.assets)).toBe(
      javascriptLearnerContentSha256V1(original, course.runtime.glossary, course.assets),
    );
  });
  it('可視feedbackの必須判定が変わればhashを更新する', () => {
    const changed = structuredClone(lesson);
    changed.exercises[0]!.validationRules[0]!.required =
      !changed.exercises[0]!.validationRules[0]!.required;
    expect(
      javascriptLearnerContentSha256(changed, course.runtime.glossary, course.assets),
    ).not.toBe(javascriptLearnerContentSha256(lesson, course.runtime.glossary, course.assets));
  });
  it('旧v1単独ではrequired変更を検出しないため移行時は元Source hashも必要になる', () => {
    const changed = structuredClone(lesson);
    changed.exercises[0]!.validationRules[0]!.required =
      !changed.exercises[0]!.validationRules[0]!.required;
    expect(javascriptLearnerContentSha256V1(changed, course.runtime.glossary, course.assets)).toBe(
      javascriptLearnerContentSha256V1(lesson, course.runtime.glossary, course.assets),
    );
    changed.goal += ' 新しい可視説明';
    expect(
      javascriptLearnerContentSha256V1(changed, course.runtime.glossary, course.assets),
    ).not.toBe(javascriptLearnerContentSha256V1(lesson, course.runtime.glossary, course.assets));
  });
  it('説明/課題/Hint/可視feedbackの変更は対象教材だけの未確認要因にする', () => {
    for (const field of ['goal', 'instructions', 'hint', 'feedback']) {
      const changed = structuredClone(lesson);
      if (field === 'goal') changed.goal += ' 新しい説明';
      if (field === 'instructions')
        changed.exercises[0]!.instructions = [{ type: 'paragraph', text: '新しい課題' }];
      if (field === 'hint') changed.exercises[0]!.hints[0]!.text += ' 新しいHint';
      if (field === 'feedback')
        changed.exercises[0]!.validationRules[0]!.feedback.expected += ' 新しい説明';
      expect(
        javascriptLearnerContentSha256(changed, course.runtime.glossary, course.assets),
      ).not.toBe(javascriptLearnerContentSha256(lesson, course.runtime.glossary, course.assets));
    }
  });
  it('同じpathの図版bytes変更と欠落も見逃さない', () => {
    const asset = lesson.slides.flatMap(({ assets }) => assets)[0]!;
    const changed = new Map(course.assets);
    const key = asset.path.replace(/^generated\/content\//u, '');
    changed.set(key, new TextEncoder().encode('changed-image-unit-only'));
    expect(javascriptLearnerContentSha256(lesson, course.runtime.glossary, changed)).not.toBe(
      javascriptLearnerContentSha256(lesson, course.runtime.glossary, course.assets),
    );
    changed.delete(key);
    expect(() => javascriptLearnerContentSha256(lesson, course.runtime.glossary, changed)).toThrow(
      'Asset',
    );
  });
});
