// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { ExerciseSourceSchema } from '../../scripts/content/sourceSchema';
import { ExerciseSchema } from '../../src/core/content/schema';
import { analyzeControlledForm } from '../../src/adapters/runtime/react/checkControlledFormSource';
import { analyzeExternalSource } from '../../src/adapters/runtime/react/checkExternalSource';
import { isControlledFormWorkspace } from '../../src/adapters/runtime/react/controlledFormScaffold';
import { isHookWorkspace } from '../../src/adapters/runtime/react/hookScaffold';
import {
  acceptsReactFormScenarios,
  reactFormScenarios,
} from '../../src/core/content/reactFormInteractions';
import {
  acceptsReactHookScenarios,
  reactHookScenarios,
} from '../../src/core/content/reactHookInteractions';

let loaded: Awaited<ReturnType<typeof loadAuthoringCourse>>;
beforeAll(async () => {
  loaded = await loadAuthoringCourse('content/react');
}, 30_000);

it('1箇所修正の後でFormとEffectを本人が組み立て、既存の連続操作と正負Fixtureを保つ', async () => {
  const { runtime: course, exercises } = loaded;
  const lessons = course.phases[0]!.chapters[0]!.lessons;
  for (const suffix of ['06', '11']) {
    const baseId = `react-ch01-l${suffix}`;
    const id = `${baseId}-compose`;
    const lesson = lessons.find((item) => item.id === id);
    expect(lesson, id).toBeDefined();
    if (!lesson) continue;
    expect(lessons.indexOf(lesson)).toBe(lessons.findIndex((item) => item.id === baseId) + 1);
    expect(lesson.prerequisiteLessonIds).toContain(baseId);
    const exercise = exercises.find((item) => item.id === `${id}-e01`)!;
    const base = exercises.find((item) => item.id === `${baseId}-e01`)!;
    expect(exercise.scaffoldLevel).toBe('compose');
    expect(exercise.runtime).toEqual(base.runtime);
    expect(exercise.interactionScenarios).toEqual(
      suffix === '06'
        ? reactFormScenarios('controlled-form', exercise.id)
        : reactHookScenarios('external-sync', exercise.id),
    );
    expect(
      exercise.interactionScenarios!.map((scenario) => ({ ...scenario, id: 'same-scenario' })),
    ).toEqual(base.interactionScenarios!.map((scenario) => ({ ...scenario, id: 'same-scenario' })));
    const starter = exercise.files.find((file) => file.path === 'components.tsx')!.content;
    // 空欄の処理を残し、未定義識別子や1行だけの修正から開始しない。
    expect(starter).toContain('TODO');
    expect(starter).not.toMatch(/\buseState\s*(?:<[^>]+>)?\s*\(/u);
    expect(starter).not.toMatch(/\buseEffect\s*\(/u);
    const analyze =
      suffix === '06'
        ? (source: string) => analyzeControlledForm(source)
        : (source: string) => analyzeExternalSource(source, false);
    expect(analyze(starter).diagnostics).toHaveLength(1);
    expect(exercise.fixtures.find((fixture) => fixture.id === 'starter')).toMatchObject({
      expectedStatus: 'code-error',
      expectedDiagnosticCodes: ['react-type-error-0'],
      expectedFeedbackRuleIds: [],
    });
    expect(
      exercise.fixtures.filter((fixture) => fixture.expectedStatus === 'pass').length,
    ).toBeGreaterThanOrEqual(2);
    expect(exercise.fixtures.some((fixture) => fixture.expectedStatus === 'incomplete')).toBe(true);
    for (const fixture of exercise.fixtures) {
      const files = Object.fromEntries(fixture.files.map((file) => [file.path, file.content]));
      expect(
        suffix === '06'
          ? isControlledFormWorkspace(files)
          : isHookWorkspace(files, 'effect-sync-v1'),
      ).toBe(true);
      if (fixture.expectedStatus === 'pass') {
        const result = analyze(files['components.tsx']!);
        expect(result.diagnostics, fixture.id).toEqual([]);
        const facts = result.facts;
        if ('usesSingleState' in facts) {
          expect(facts.usesSingleState).toBe(true);
          expect(facts.usesControlledInput).toBe(true);
          expect(facts.derivesFromSameState).toBe(true);
          expect(facts.preventsSubmit).toBe(true);
        } else expect(Object.values(facts).every(Boolean), fixture.id).toBe(true);
      }
    }
    for (const file of base.files.filter((file) => !file.editable)) {
      expect(exercise.files.find((item) => item.path === file.path)?.content).toBe(file.content);
    }
  }
});

it.each(['06', '11'])(
  'compose %sの操作IDを旧課題へ戻すことや連続操作を削ることを両schemaが拒否する',
  async (suffix) => {
    const id = `react-ch01-l${suffix}-compose-e01`;
    const exercise = loaded.exercises.find((exercise) => exercise.id === id)!;
    const published = loaded.runtime.phases[0]!.chapters[0]!.lessons.flatMap(
      (lesson) => lesson.exercises,
    ).find((exercise) => exercise.id === id)!;
    const source = ExerciseSourceSchema.parse(
      YAML.parse(
        await readFile(
          `content/react/chapters/react-ch01/lessons/react-ch01-l${suffix}-compose/exercises/${id}/exercise.yaml`,
          'utf8',
        ),
      ),
    );
    const goal = suffix === '06' ? 'controlled-form' : 'external-sync';
    const factory = suffix === '06' ? reactFormScenarios : reactHookScenarios;
    const accepts = suffix === '06' ? acceptsReactFormScenarios : acceptsReactHookScenarios;
    const legacy = factory(goal);
    expect(factory(goal, `react-ch01-l${suffix}-e01`)).toEqual(legacy);
    expect(legacy[0]!.id).toBe(
      suffix === '06' ? 'form-input-submit-reset' : 'effect-subscription-lifecycle',
    );
    expect(accepts(goal, exercise.interactionScenarios, id)).toBe(true);
    expect(ExerciseSchema.safeParse(published).success).toBe(true);
    for (const scenarios of [
      undefined,
      [],
      legacy,
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        actions: scenario.actions.slice(1),
      })),
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        checkpoints: scenario.checkpoints.slice(1),
      })),
      exercise.interactionScenarios!.map((scenario) => ({
        ...scenario,
        checkpoints: scenario.checkpoints.map((checkpoint) => ({
          ...checkpoint,
          expectations: checkpoint.expectations.slice(1),
        })),
      })),
    ]) {
      expect(accepts(goal, scenarios, id)).toBe(false);
      expect(
        ExerciseSourceSchema.safeParse({ ...source, interactionScenarios: scenarios }).success,
      ).toBe(false);
      expect(
        ExerciseSchema.safeParse({ ...published, interactionScenarios: scenarios }).success,
      ).toBe(false);
    }
  },
);
