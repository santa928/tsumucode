import {
  compileCourse,
  type AuthoringExercise,
  type CompiledCourseArtifacts,
} from '../../../../scripts/content/compileCourse';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import type { Lesson } from '../../../../src/core/content/types';
import { reactMovementFixture } from './reactMovementFixture';
import { hashValue } from '../../../../scripts/release/v2/identity';
import {
  MOVEMENT_ID,
  MovementBodySchema,
  MovementInputsSchema,
  PURE_MOVES,
  movementIntentScope,
  movementOriginals,
} from '../../../../scripts/release/v2/movement';

// unit専用の合成protocol入力。ここで作るhash/承認を公開証拠へ書き出さない。
const OLD_INTENTS = [
  ['solution', 'solution'],
  ['direct-return', 'direct-return-scope'],
  ['commuted-and-renamed', 'alternative'],
  ['stored-results', 'alternative'],
  ['starter', 'starter'],
  ['constant-return', 'misconception'],
  ['no-return', 'misconception'],
  ['unused-function', 'unused-correct-function'],
  ['outer-value', 'misconception'],
  ['reference-error', 'missing-after-valid-calls'],
] as const;

function oldExercise(
  exercise: AuthoringExercise,
  from: string,
  to: string,
  references: Record<string, string>,
): AuthoringExercise {
  const map = (id: string) => {
    if (id !== to && !id.startsWith(to + '-')) return id;
    const old = from + id.slice(to.length);
    references[old] = id;
    return old;
  };
  return {
    ...structuredClone(exercise),
    id: map(exercise.id),
    workspaceId: map(exercise.workspaceId),
    steps: exercise.steps.map((step) => ({
      ...step,
      id: map(step.id),
      validationRuleIds: step.validationRuleIds.map(map),
    })),
    validationRules: exercise.validationRules.map((rule) => ({
      ...rule,
      id: map(rule.id),
      hintId: map(rule.hintId),
      relatedSlideId: map(rule.relatedSlideId),
    })),
    hints: exercise.hints.map((hint) => ({
      ...hint,
      id: map(hint.id),
      ...(hint.relatedSlideId ? { relatedSlideId: map(hint.relatedSlideId) } : {}),
    })),
    relatedSlideIds: exercise.relatedSlideIds.map(map),
    fixtures: exercise.fixtures.map((fixture) => ({
      ...fixture,
      expectedFeedbackRuleIds: fixture.expectedFeedbackRuleIds.map(map),
    })),
  };
}

/** 現Pythonと固定4React旧目標から、認証済み公開物ではないunit入力を組み立てる。 */
export async function movementFixture() {
  const compilations = await Promise.all([
    compileCourse('content/python-basics'),
    reactMovementFixture(oldExercise),
  ]);
  const inventory = buildInventory(compilations),
    references: Record<string, string> = {};
  const previousCompilations: CompiledCourseArtifacts[] = compilations.map((compilation) => {
    const lessons = compilation.runtime.phases.flatMap((phase) =>
      phase.chapters.flatMap((chapter) => chapter.lessons),
    );
    const previousExercises: AuthoringExercise[] = [];
    const moved: Lesson[] = PURE_MOVES.filter(
      ([courseId]) => courseId === compilation.runtime.id,
    ).map(([, from, to]) => {
      const lesson = lessons.find((lesson) => lesson.id === to)!;
      const exercises = lesson.exercises.map((exercise) =>
        oldExercise(
          compilation.authoringExercises!.find((row) => row.id === exercise.id)!,
          from,
          to,
          references,
        ),
      );
      previousExercises.push(...exercises);
      return { ...lesson, id: from, exercises };
    });
    if (compilation.runtime.id === 'python-basics') {
      const lesson = lessons.find((row) => row.id === 'python-basics-ch01-l11')!;
      const full = compilation.authoringExercises!.find(
        (row) => row.id === 'python-basics-ch01-l11-e01',
      )!;
      const replacement = {
        ...structuredClone(full),
        id: 'python-basics-ch01-l07-e01',
        fixtures: OLD_INTENTS.map(([oldId, witnessId]) => ({
          ...structuredClone(full.fixtures.find((row) => row.id === witnessId)!),
          id: oldId,
        })),
      };
      moved.push({ ...lesson, id: 'python-basics-ch01-l07', exercises: [replacement] });
      previousExercises.push(replacement);
    }
    const phase = compilation.runtime.phases[0]!,
      chapter = phase.chapters[0]!;
    return {
      ...compilation,
      runtime: {
        ...compilation.runtime,
        phases: [{ ...phase, chapters: [{ ...chapter, lessons: moved }] }],
      },
      authoringExercises: previousExercises,
    };
  });
  const previousInventory = buildInventory(previousCompilations);
  const baseline = {
    deploymentId: '501',
    sourceCommit: '1'.repeat(40),
    artifactDigest: '2'.repeat(64),
    sourceRecordDigest: '3'.repeat(64),
    inventory: previousInventory,
  };
  const previous = movementOriginals(previousCompilations),
    current = movementOriginals(compilations);
  const old = previousInventory.courses
    .find((course) => course.id === 'python-basics')!
    .lessons.find((lesson) => lesson.id === 'python-basics-ch01-l07')!.exercises[0]!;
  const target = inventory.courses
    .find((course) => course.id === 'python-basics')!
    .lessons.find((lesson) => lesson.id === 'python-basics-ch01-l11')!.exercises[0]!;
  const body = MovementBodySchema.parse({
    schemaVersion: 1 as const,
    migrationId: MOVEMENT_ID,
    baseline: {
      deploymentId: baseline.deploymentId,
      sourceCommit: baseline.sourceCommit,
      sourceRecordDigest: baseline.sourceRecordDigest,
      inventoryDigest: hashValue(previousInventory),
    },
    candidateContentCommit: '4'.repeat(40),
    candidateInventoryDigest: hashValue(inventory),
    originalsDigest: hashValue({ previous, current }),
    moves: PURE_MOVES.map(([courseId, fromLessonId, toLessonId]) => ({
      courseId,
      fromLessonId,
      toLessonId,
    })),
    references,
    intents: OLD_INTENTS.map(([oldFixtureId, witnessId]) => {
      const fixture = old.fixtures.find((row) => row.id === oldFixtureId)!,
        witness = target.fixtures.find((row) => row.id === witnessId)!;
      return {
        oldFixtureId,
        oldFixtureDigest: fixture.digest,
        oldExpectedStatus: fixture.expectedStatus,
        preservedIntent: ['Synthetic ' + oldFixtureId],
        explicitGoalOrInputDeltas: ['Synthetic split input'],
        witnesses: [
          {
            courseId: 'python-basics' as const,
            lessonId: 'python-basics-ch01-l11',
            exerciseId: target.id,
            caseKind: 'authored' as const,
            fixtureId: witness.id,
            fixtureDigest: witness.digest,
            modes: [
              {
                mode: 'pyodide' as const,
                sourceDigest: witness.sourceDigest,
                expectedStatus: witness.expectedStatus,
              },
              {
                mode: 'cpython' as const,
                sourceDigest: witness.nativeSourceDigest!,
                expectedStatus: witness.expectedLocalStatus ?? witness.expectedStatus,
              },
            ],
          },
        ],
      };
    }),
    recheckLessons: [
      ...['07', '08', '09', '10', '11', '12', '13'].map(
        (id) => 'python-basics/python-basics-ch01-l' + id,
      ),
      ...[
        'react-ch02-l01',
        'react-ch02-l02',
        'react-ch03-l01',
        'react-ch03-l02',
        'react-ch04-l01',
      ].map((id) => 'react/' + id),
    ],
  });
  const bodyDigest = hashValue(body);
  const approvals = body.intents.map((intent) => {
    const unsigned = {
      schemaVersion: 1 as const,
      migrationId: MOVEMENT_ID,
      bodyDigest,
      oldFixtureId: intent.oldFixtureId,
      scopeDigest: movementIntentScope(body, intent.oldFixtureId),
      authorId: 'synthetic-author',
      reviewerId: 'synthetic-reviewer',
      status: 'approved' as const,
      method: 'source-review' as const,
      originalDigest: hashValue('synthetic original ' + intent.oldFixtureId),
      originalsCheckedBy: 'synthetic-inspector',
    };
    return { ...unsigned, receiptDigest: hashValue(unsigned) };
  });
  const unsigned = { body, bodyDigest, approvals };
  return {
    compilations,
    inventory,
    baseline,
    inputs: MovementInputsSchema.parse({
      declaration: { ...unsigned, declarationDigest: hashValue(unsigned) },
      previous,
      current,
    }),
  };
}
