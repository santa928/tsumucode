import type { CompiledCourseArtifacts } from '../../../../scripts/content/compileCourse';
import type { Lesson } from '../../../../src/core/content/types';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { PURE_MOVES, movementIntentScope } from '../../../../scripts/release/v2/movement';
import { movementFixture } from './movementFixture';

// 独立監査と同じ全可視fieldを残すunit fixture。実公開の承認や原本は生成しない。
export function visibleProjection(compilation: CompiledCourseArtifacts, lesson: Lesson) {
  const { completion, nextLessonId, prerequisiteLessonIds, ...visible } = lesson;
  void nextLessonId;
  void prerequisiteLessonIds;
  return {
    ...visible,
    ...(lesson.kind === 'standard'
      ? {}
      : {
          project: {
            brief: lesson.project.brief,
            guide: lesson.project.guide,
            checklist: lesson.project.checklist.map(({ label, required }) => ({ label, required })),
          },
        }),
    exercises: lesson.exercises.map((exercise) => {
      const {
        runtime,
        interactionScenarios,
        validationRules,
        workspaceId,
        countsTowardStandardExerciseTotal,
        ...row
      } = exercise;
      void runtime;
      void interactionScenarios;
      void workspaceId;
      void countsTowardStandardExerciseTotal;
      return {
        ...row,
        ...(completion.kind === 'capstone'
          ? {}
          : {
              requiredForCompletion: completion.requiredExerciseIds.includes(exercise.id),
            }),
        steps: exercise.steps.map(({ validationRuleIds, ...step }) => {
          void validationRuleIds;
          return step;
        }),
        validationFeedback: validationRules.map(({ label, required, feedback }) => ({
          label,
          required,
          feedback,
        })),
      };
    }),
    glossary: lesson.glossaryRefs.map((id) => {
      const entry = compilation.runtime.glossary.find((row) => row.id === id);
      if (!entry) throw Error('Missing test glossary');
      return entry;
    }),
    assetSha256s: [
      ...lesson.slides.flatMap((slide) => slide.assets),
      ...lesson.exercises.flatMap((exercise) => exercise.assets),
    ].map((asset) => {
      const bytes = compilation.assets.get(asset.path.replace(/^generated\/content\//u, ''));
      if (!bytes) throw Error('Missing test asset');
      return { path: asset.path, sha256: hashBytes(bytes) };
    }),
  };
}

export type Projection = ReturnType<typeof visibleProjection>;
export const moduleBefore =
  '目標は、関数の定義を別ファイルへ分け、呼び出した結果に変更が反映されると説明することです。前提は#141のFunctionです。新しく使うのは`from ... import ...`です。';
export const moduleAfter =
  '目標は、関数の定義を別ファイルへ分け、呼び出した結果に変更が反映されると説明することです。これまでに学んだ、引数を受け取って値を返す関数を使います。新しく使うのは`from ... import ...`です。';

function oldProjection(value: unknown, from: string, to: string, field = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => oldProjection(item, from, to, field));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, oldProjection(item, from, to, key)]),
    );
  if (typeof value !== 'string') return value;
  const old = (id: string) =>
    id === to || id.startsWith(to + '-') ? from + id.slice(to.length) : id;
  if (
    ['id', 'assetId', 'relatedSlideId', 'relatedSlideIds', 'firstSlideId', 'provenanceId'].includes(
      field,
    )
  )
    return old(value);
  if (field === 'path' && value.startsWith('generated/content/assets/')) {
    const split = value.lastIndexOf('/');
    return value.slice(0, split + 1) + old(value.slice(split + 1));
  }
  return value;
}

export function replaceAt(
  value: unknown,
  keys: readonly (string | number)[],
  replacement: unknown,
) {
  let cursor = value as Record<string | number, unknown>;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] as typeof cursor;
  cursor[keys[keys.length - 1]!] = replacement;
}

export function sealLearnerFixture(fixture: Awaited<ReturnType<typeof learnerCarryFixture>>) {
  const { inputs, inventory, baseline } = fixture;
  const { body } = inputs.declaration;
  body.baseline.inventoryDigest = hashValue(baseline.inventory);
  body.candidateInventoryDigest = hashValue(inventory);
  body.originalsDigest = hashValue({
    previous: inputs.previous,
    current: inputs.current,
    learnerOriginals: inputs.learnerOriginals,
  });
  inputs.declaration.bodyDigest = hashValue(body);
  for (const approval of inputs.declaration.approvals) {
    approval.bodyDigest = inputs.declaration.bodyDigest;
    approval.scopeDigest = movementIntentScope(body, approval.oldFixtureId);
    const { receiptDigest, ...unsigned } = approval;
    void receiptDigest;
    approval.receiptDigest = hashValue(unsigned);
  }
  const { declarationDigest, ...unsigned } = inputs.declaration;
  void declarationDigest;
  inputs.declaration.declarationDigest = hashValue(unsigned);
  return fixture;
}

export async function learnerCarryFixture() {
  const fixture = await movementFixture();
  const previous: { courseId: string; lessonId: string; projection: Projection }[] = [];
  const current: typeof previous = [];
  for (const [courseId, from, to] of [
    ...PURE_MOVES.map(([course, from, to]) => [course, from, to]),
    ['react', 'react-ch01-l01', 'react-ch01-l01'],
  ]) {
    const compilation = fixture.compilations.find((row) => row.runtime.id === courseId)!;
    const lesson = compilation.runtime.phases
      .flatMap((phase) => phase.chapters)
      .flatMap((chapter) => chapter.lessons)
      .find((row) => row.id === to)!;
    const projection = visibleProjection(compilation, lesson);
    const original = oldProjection(structuredClone(projection), from!, to!) as Projection;
    if (to === 'python-basics-ch01-l12')
      replaceAt(original, ['exercises', 0, 'instructions', 1, 'text'], moduleBefore);
    if (to === 'react-ch01-l01') {
      replaceAt(original, ['exercises', 0, 'steps', 0, 'change'], '問題文を指定の文字列へ直す');
      replaceAt(
        original,
        ['exercises', 0, 'steps', 0, 'observe'],
        '型の案内が消え、問題カードの見出しに反映される',
      );
      const oldCourse = fixture.baseline.inventory.courses.find((row) => row.id === courseId)!;
      oldCourse.lessons.push(
        structuredClone(
          fixture.inventory.courses
            .find((row) => row.id === courseId)!
            .lessons.find((row) => row.id === to)!,
        ),
      );
      const oldExercise = structuredClone(
        compilation.authoringExercises!.find((row) => row.id === lesson.exercises[0]!.id)!,
      );
      oldExercise.steps[0]!.change = '問題文を指定の文字列へ直す';
      oldExercise.steps[0]!.observe = '型の案内が消え、問題カードの見出しに反映される';
      fixture.inputs.previous.find((row) => row.courseId === courseId)!.exercises.push(oldExercise);
      const oldLesson = oldCourse.lessons.find((row) => row.id === to)!;
      oldLesson.exercises[0]!.digest = hashValue(oldExercise);
      oldLesson.exerciseDigest = hashValue(oldLesson.exercises);
    }
    fixture.baseline.inventory.courses
      .find((row) => row.id === courseId)!
      .lessons.find((row) => row.id === from)!.learnerDigest = hashValue(original);
    previous.push({ courseId: courseId!, lessonId: from!, projection: original });
    current.push({ courseId: courseId!, lessonId: to!, projection });
  }
  return { ...fixture, inputs: { ...fixture.inputs, learnerOriginals: { previous, current } } };
}
