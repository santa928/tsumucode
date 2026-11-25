// @vitest-environment node
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { reactReadingScenarios } from '../../src/core/content/reactReadingInteractions';
import { matchesDomText } from '../../src/core/validation/matchesDomText';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import {
  ExerciseSchema,
  HtmlCssValidationRuleDefinitionSchema,
} from '../../src/core/content/schema';
import { analyzeReadingList } from '../../src/adapters/runtime/react/checkReadingListSource';
import { isReadingWorkspace } from '../../src/adapters/runtime/react/readingListScaffold';

let course: ReturnType<typeof loadAuthoringCourse>;
// 全教材の読取は準備として完了させ、個々の意味検査の時間枠と分ける。
beforeAll(async () => {
  course = loadAuthoringCourse('content/react');
  await course;
});

describe('読書リスト3段階の配布範囲と採点', () => {
  it('子の自作から親の自作、仕様からの追加へ進み、既存クイズを残す', async () => {
    const loaded = await course;
    const lessons = loaded.runtime.phases.flatMap((phase) =>
      phase.chapters.flatMap((chapter) => chapter.lessons),
    );
    expect(
      lessons.filter((lesson) => !lesson.id.startsWith('react-ch01-')).map((lesson) => lesson.id),
    ).toEqual([
      'react-ch02-l01',
      'react-ch02-l02',
      'react-ch02-l03',
      'react-ch02-l04',
      'react-ch03-l01',
      'react-ch03-l02',
      'react-ch04-l01',
    ]);
    expect(loaded.masteryDiagnostics).toEqual([]);
    const targets = loaded.exercises.filter((exercise) =>
      ['react-ch02-l01-e01', 'react-ch02-l02-e01', 'react-ch02-l03-e01'].includes(exercise.id),
    );
    expect(
      targets.map((exercise) =>
        exercise.files.filter((file) => file.editable).map((file) => file.path),
      ),
    ).toEqual([['BookCard.tsx'], ['components.tsx'], ['components.tsx']]);
    expect(targets.map((exercise) => exercise.workspaceId)).toEqual([
      'react-ch02-l01-e01',
      'react-ch02-l02-e01',
      'react-ch02-l03-e01',
    ]);
    for (const exercise of targets) {
      if (exercise.runtime?.kind !== 'react') throw new Error('React実行契約が必要です');
      const solution = Object.fromEntries(
        exercise.solutionFiles.map((file) => [file.path, file.content]),
      );
      expect(isReadingWorkspace(solution, exercise.runtime.profile)).toBe(true);
      for (const fixture of exercise.fixtures) {
        expect(
          isReadingWorkspace(
            Object.fromEntries(fixture.files.map((file) => [file.path, file.content])),
            exercise.runtime.profile,
          ),
          fixture.id,
        ).toBe(true);
      }
      const checked = analyzeReadingList(solution);
      expect(checked.diagnostics).toEqual([]);
      expect(checked.facts.definesBookComponent).toBe(true);
      if (exercise.runtime.profile !== 'reading-card-v1') {
        expect(checked.facts.ownsReadingState).toBe(true);
        expect(checked.facts.usesStableBookKeys).toBe(true);
      }
    }
  });

  it('カードの境界にある空白だけを許し、題名・状態・操作名・冊数・順序はすべて照合する', async () => {
    const { exercises } = await course;
    const exercise = exercises.find(({ id }) => id === 'react-ch02-l01-e01')!;
    const initial = HtmlCssValidationRuleDefinitionSchema.parse(
      exercise.validationRules[0],
    ).assertion;
    const afterToggle = exercise.interactionScenarios![0]!.checkpoints[0]!.expectations[0]!;
    if (
      initial.kind !== 'text' ||
      initial.operator !== 'equals' ||
      afterToggle.kind !== 'selector-text'
    ) {
      throw new Error('読書カードの初期判定と操作後判定が必要です');
    }
    const stars = '星の地図 未読 読了にする';
    const rain = '雨の日の本既読未読にする';
    const forest = '森の記録 未読読了にする';
    const list = [stars, rain, forest].join(' ');
    const matchesInitial = (text: string) =>
      matchesDomText(text, initial.expected, initial.optionalSpaces);
    expect(matchesInitial(list)).toBe(true);
    expect(matchesInitial(list.replaceAll(' ', ''))).toBe(true);
    for (const wrong of [
      list.replace('星の地図', '星の 地図'),
      list.replace('未読', '未 読'),
      list.replace('読了にする', '読了 にする'),
      list.replace(stars, '星の地図 既読 未読にする'),
      [rain, stars, forest].join(' '),
      [stars, forest].join(' '),
      [stars, rain, forest, forest].join(' '),
    ]) {
      expect(matchesInitial(wrong)).toBe(false);
    }
    const changed = list.replace(stars, '星の地図 既読 未読にする');
    expect(matchesDomText(changed, afterToggle.equals, afterToggle.optionalSpaces)).toBe(true);
    expect(matchesDomText(list, afterToggle.equals, afterToggle.optionalSpaces)).toBe(false);
    expect(matchesDomText('既読1件/全3件', '既読1件 / 全3件')).toBe(false);
  });

  it.each([1, 2, 3])('第%s段階の連続操作を削除・弱体化した教材を拒否する', async (stage) => {
    const lesson = `react-ch02-l0${String(stage)}`;
    const source = ExerciseSourceSchema.parse(
      YAML.parse(
        await readFile(
          `content/react/chapters/react-ch02/lessons/${lesson}/exercises/${lesson}-e01/exercise.yaml`,
          'utf8',
        ),
      ),
    );
    const loaded = await course;
    const published = loaded.runtime.phases
      .flatMap((phase) => phase.chapters.flatMap((chapter) => chapter.lessons))
      .find((item) => item.id === lesson)!.exercises[0]!;
    expect(ExerciseSchema.safeParse(published).success).toBe(true);
    const scenarios = source.interactionScenarios!;
    if (source.runtime?.kind !== 'react') throw new Error('React実行契約が必要です');
    const legacyScenarios = reactReadingScenarios(source.runtime.learningGoal, false);
    const legacyRules = source.validationRules.map((rule) => {
      if (rule.target.kind !== 'selector' || rule.target.selector !== '#books') return rule;
      const { assertion } = HtmlCssValidationRuleDefinitionSchema.parse(rule);
      if (assertion.kind !== 'text' || assertion.operator !== 'equals' || !assertion.optionalSpaces)
        return rule;
      return {
        ...rule,
        assertion: {
          kind: 'text',
          operator: 'equals',
          expected: assertion.expected.replaceAll(' ', ''),
        },
      };
    });
    for (const [schema, exercise] of [
      [ExerciseSourceSchema, source],
      [ExerciseSchema, published],
    ] as const) {
      expect(
        schema.safeParse({
          ...exercise,
          validationRules: legacyRules,
          interactionScenarios: legacyScenarios,
        }).success,
      ).toBe(true);
      expect(schema.safeParse({ ...exercise, validationRules: legacyRules }).success).toBe(false);
      expect(schema.safeParse({ ...exercise, interactionScenarios: legacyScenarios }).success).toBe(
        false,
      );
      const first = scenarios[0]!;
      expect(
        schema.safeParse({
          ...exercise,
          interactionScenarios: [
            {
              ...first,
              checkpoints: [legacyScenarios[0]!.checkpoints[0]!, ...first.checkpoints.slice(1)],
            },
            ...scenarios.slice(1),
          ],
        }).success,
      ).toBe(false);
    }

    for (const interactionScenarios of [
      undefined,
      scenarios.map((scenario) => ({ ...scenario, checkpoints: scenario.checkpoints.slice(1) })),
      scenarios.map((scenario) => ({
        ...scenario,
        checkpoints: scenario.checkpoints.map((checkpoint) => ({
          ...checkpoint,
          expectations: checkpoint.expectations.slice(1),
        })),
      })),
    ]) {
      expect(ExerciseSourceSchema.safeParse({ ...source, interactionScenarios }).success).toBe(
        false,
      );
      expect(ExerciseSchema.safeParse({ ...published, interactionScenarios }).success).toBe(false);
    }
  });
});
