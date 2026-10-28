// @vitest-environment node
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import { ExerciseSchema } from '../../src/core/content/schema';
import { analyzeReadingList } from '../../src/adapters/runtime/react/checkReadingListSource';
import { isReadingWorkspace } from '../../src/adapters/runtime/react/readingListScaffold';

const course = loadAuthoringCourse('content/react');

describe('読書リスト3段階の配布範囲と採点', () => {
  it('子の自作から親の自作、仕様からの追加へ進み、既存クイズを残す', async () => {
    const loaded = await course;
    const lessons = loaded.runtime.phases.flatMap((phase) =>
      phase.chapters.flatMap((chapter) => chapter.lessons),
    );
    expect(lessons.slice(12).map((lesson) => lesson.id)).toEqual([
      'react-ch02-l01',
      'react-ch02-l02',
      'react-ch02-l03',
      'react-ch03-l01',
      'react-ch03-l02',
      'react-ch04-l01',
    ]);
    expect(loaded.masteryDiagnostics).toEqual([]);
    const targets = loaded.exercises.filter((exercise) => exercise.id.startsWith('react-ch02-'));
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
      const checked = analyzeReadingList(solution);
      expect(checked.diagnostics).toEqual([]);
      expect(checked.facts.definesBookComponent).toBe(true);
      if (exercise.runtime.profile !== 'reading-card-v1') {
        expect(checked.facts.ownsReadingState).toBe(true);
        expect(checked.facts.usesStableBookKeys).toBe(true);
      }
    }
  });

  it.each([1, 2, 3])('第%s段階の連続操作を削除・弱体化した教材を拒否する', async (stage) => {
    const lesson = `react-ch02-l0${stage}`;
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
