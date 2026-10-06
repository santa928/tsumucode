// @vitest-environment node
/** 制作工程の共有Sourceと閉じた採点契約を確認する。 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  TypeScriptQuizProjectContracts,
  createTypeScriptQuizProjectScenarios,
} from '../../src/core/content/typeScriptQuizProjectContract';
let authoring: Awaited<ReturnType<typeof loadAuthoringCourse>>;
beforeAll(async () => {
  authoring = await loadAuthoringCourse('content/typescript');
});
describe('TypeScriptの段階制作', () => {
  it('3工程で同じ5Fileを保持し、前工程の解答から次工程のStarterへ積み上げる', () => {
    const exercises = authoring.exercises.filter(({ id }) => id.startsWith('typescript-ch06-'));
    expect(exercises).toHaveLength(3);
    for (const [index, exercise] of exercises.entries()) {
      expect(exercise.workspaceId).toBe('typescript-quiz-guided');
      if (exercise.kind !== 'guided-project') throw new Error('制作工程が必要です');
      expect(exercise.projectId).toBe('typescript-quiz-guided');
      expect(exercise.files.filter(({ editable }) => editable).map(({ path }) => path)).toEqual([
        'main.ts',
      ]);
      expect(exercise.files.filter(({ editable }) => !editable)).toEqual(
        exercises[0]!.files.filter(({ editable }) => !editable),
      );
      if (index > 0)
        expect(exercise.files[0]!.content).toBe(exercises[index - 1]!.solutionFiles[0]!.content);
      expect(exercise.countsTowardStandardExerciseTotal).toBe(false);
    }
  });
  it.each(['01', '02', '03'])(
    '工程%sのruntime・全操作・Projectを省略/改変した原稿を拒否する',
    (suffix) => {
      const root = `content/typescript/chapters/typescript-ch06/lessons/typescript-ch06-l${suffix}/exercises/typescript-ch06-l${suffix}-e01`;
      const source = ExerciseSourceSchema.parse(
        parse(readFileSync(`${root}/exercise.yaml`, 'utf8')) as unknown,
      );
      if (!source.interactionScenarios || !source.runtime) throw new Error('制作契約が必要です');
      expect(ExerciseSourceSchema.safeParse(source).success).toBe(true);
      const contract = TypeScriptQuizProjectContracts.find(
        ({ lessonId }) => source.id === `${lessonId}-e01`,
      );
      if (!contract) throw new Error('固定工程が必要です');
      const profile = contract.profile;
      expect(source.interactionScenarios).toEqual(createTypeScriptQuizProjectScenarios(profile));
      for (const changed of [
        { ...source, runtime: undefined },
        { ...source, runtime: { ...source.runtime, kind: 'javascript', entryFile: 'main.js' } },
        { ...source, interactionScenarios: [] },
        { ...source, interactionScenarios: source.interactionScenarios.slice(1) },
        { ...source, projectId: 'other' },
        { ...source, workspaceId: 'other' },
        { ...source, kind: 'standard' },
        {
          ...source,
          interactionScenarios: source.interactionScenarios.map((scenario: object) => ({
            ...scenario,
            checkpoints: [],
          })),
        },
      ])
        expect(ExerciseSourceSchema.safeParse(changed).success).toBe(false);
    },
  );
});
