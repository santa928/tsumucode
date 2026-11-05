import { z } from 'zod';
import type { AuthoringExercise, CompiledCourseArtifacts } from '../../content/compileCourse';
import { javascriptLearnerContentProjection } from '../javascriptLessonEvaluation';
import { hashValue } from './identity';
import { CommitSchema, DigestSchema, IdSchema, type ReleaseInventory } from './schema';

type Moves = readonly (readonly [string, string, string, number])[];
const INITIAL_REACT = ['react', 'react-ch01-l01', 'react-ch01-l01'] as const;
const OriginalSchema = z
  .object({
    courseId: IdSchema,
    lessonId: IdSchema,
    projection: z.record(z.string(), z.json()),
  })
  .strict();
export const LearnerMovementOriginalsSchema = z
  .object({
    previous: z.array(OriginalSchema).min(2).max(6),
    current: z.array(OriginalSchema).min(2).max(6),
  })
  .strict();
export type LearnerMovementOriginals = z.infer<typeof LearnerMovementOriginalsSchema>;
const CarrySchema = z
  .object({
    kind: z.enum(['identical-move', 'content-delta', 'reference-only']),
    courseId: IdSchema,
    fromLessonId: IdSchema,
    toLessonId: IdSchema,
    sourceCommit: CommitSchema,
    sourceRecordDigest: DigestSchema,
    fromLearnerDigest: DigestSchema,
    candidateContentCommit: CommitSchema,
    toLearnerDigest: DigestSchema,
    movementDeclarationDigest: DigestSchema,
  })
  .strict();
export const ReferenceOnlyCarrySchema = CarrySchema.extend({
  kind: z.literal('reference-only'),
}).strict();
export const MovementLearnerAcceptanceSchema = z.union([
  ReferenceOnlyCarrySchema,
  CarrySchema.extend({ kind: z.literal('identical-move') }).strict(),
  CarrySchema.extend({
    kind: z.literal('content-delta'),
    contentReceiptDigest: DigestSchema,
  }).strict(),
]);
type Carry = z.infer<typeof CarrySchema>;

function pairs(moves: Moves) {
  return [
    ...moves.map(([course, from, to]) => [course, from, to] as const),
    ...(moves.some(([course]) => course === 'react') ? [INITIAL_REACT] : []),
  ];
}

/** 同じCompileから今回の固定対象だけを保存する。任意Lessonの免除原本にはしない。 */
export function learnerMovementOriginals(
  compilations: readonly CompiledCourseArtifacts[],
  moves: Moves,
  side: 'previous' | 'current',
) {
  return pairs(moves).flatMap(([courseId, from, to]) => {
    const compilation = compilations.find((row) => row.runtime.id === courseId);
    if (!compilation) return [];
    const lessonId = side === 'previous' ? from : to;
    const lesson = compilation.runtime.phases
      .flatMap((phase) => phase.chapters)
      .flatMap((chapter) => chapter.lessons)
      .find((row) => row.id === lessonId);
    if (!lesson) throw Error('Missing fixed learner projection: ' + lessonId);
    return [
      OriginalSchema.parse({
        courseId,
        lessonId,
        projection: javascriptLearnerContentProjection(
          lesson,
          compilation.runtime.glossary,
          compilation.assets,
        ),
      }),
    ];
  });
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown) => value as ObjectValue;
const array = (value: unknown) => value as unknown[];

/** 型付き構造位置だけを書換える。本文、code、files、feedback文字列は触らない。 */
function mappedProjection(projection: ObjectValue, courseId: string, moves: Moves) {
  const result = structuredClone(projection);
  const id = (value: unknown) => {
    if (typeof value !== 'string') return value;
    for (const [course, from, to] of moves)
      if (course === courseId && (value === from || value.startsWith(from + '-')))
        return to + value.slice(from.length);
    return value;
  };
  const field = (row: ObjectValue, name: string) => {
    if (name in row) row[name] = id(row[name]);
  };
  const locator = (value: unknown) => {
    if (typeof value !== 'string' || !value.startsWith('generated/content/assets/')) return value;
    const split = value.lastIndexOf('/');
    return value.slice(0, split + 1) + String(id(value.slice(split + 1)));
  };
  const blocks = (value: unknown) => {
    for (const item of array(value)) {
      const block = object(item);
      if (block.type === 'image') field(block, 'assetId');
      if (block.type === 'code') field(block, 'resultAssetId');
    }
  };
  const assets = (value: unknown) => {
    for (const item of array(value)) {
      const asset = object(item);
      field(asset, 'id');
      field(asset, 'provenanceId');
      asset.path = locator(asset.path);
    }
  };
  field(result, 'id');
  for (const item of array(result.slides)) {
    const slide = object(item);
    field(slide, 'id');
    field(slide, 'codeReferenceSlideId');
    blocks(slide.blocks);
    assets(slide.assets);
  }
  for (const item of array(result.exercises)) {
    const exercise = object(item);
    field(exercise, 'id');
    blocks(exercise.instructions);
    assets(exercise.assets);
    exercise.relatedSlideIds = array(exercise.relatedSlideIds).map(id);
    for (const step of array(exercise.steps)) field(object(step), 'id');
    for (const hint of array(exercise.hints)) {
      field(object(hint), 'id');
      field(object(hint), 'relatedSlideId');
    }
  }
  for (const item of array(result.glossary)) {
    field(object(item), 'id');
    field(object(item), 'firstSlideId');
  }
  for (const item of array(result.assetSha256s)) object(item).path = locator(object(item).path);
  if (result.project) {
    blocks(object(result.project).brief);
    blocks(object(result.project).guide);
  }
  return result;
}

const MODULE_BEFORE =
  '目標は、関数の定義を別ファイルへ分け、呼び出した結果に変更が反映されると説明することです。前提は#141のFunctionです。新しく使うのは`from ... import ...`です。';
const MODULE_AFTER =
  '目標は、関数の定義を別ファイルへ分け、呼び出した結果に変更が反映されると説明することです。これまでに学んだ、引数を受け取って値を返す関数を使います。新しく使うのは`from ... import ...`です。';
const CHANGE_BEFORE = '問題文を指定の文字列へ直す';
const CHANGE_AFTER =
  'main.tsxのpromptを文字列「HTMLが受け持つものは？」へ直します。Questionの型注釈、選択肢「内容」「見た目」、correctIndexの0、QuestionCardへ渡すコードは残します。';
const OBSERVE_BEFORE = '型の案内が消え、問題カードの見出しに反映される';
const OBSERVE_AFTER =
  '「プレビューを更新」で型の案内が消え、見出し「HTMLが受け持つものは？」、選択肢「内容」「見た目」、個数2を確認します。「判定する」で表示も確かめます。';

/** JSON pointerの免除を受け取らず、記録済み実値の2Lesson/3fieldだけを照合する。 */
function applyFixedCopyDelta(
  previous: ObjectValue,
  current: ObjectValue,
  course: string,
  lesson: string,
) {
  const before = object(array(previous.exercises)[0]);
  const after = object(array(current.exercises)[0]);
  if (course === 'python-basics' && lesson === 'python-basics-ch01-l12') {
    const oldText = object(array(before.instructions)[1]);
    const newText = object(array(after.instructions)[1]);
    if (oldText.text !== MODULE_BEFORE || newText.text !== MODULE_AFTER)
      throw Error('Fixed Module learner delta differs');
    oldText.text = MODULE_AFTER;
  } else if (course === 'react' && lesson === 'react-ch01-l01') {
    const oldStep = object(array(before.steps)[0]),
      newStep = object(array(after.steps)[0]);
    if (
      oldStep.change !== CHANGE_BEFORE ||
      newStep.change !== CHANGE_AFTER ||
      oldStep.observe !== OBSERVE_BEFORE ||
      newStep.observe !== OBSERVE_AFTER
    )
      throw Error('Fixed React learner delta differs');
    oldStep.change = CHANGE_AFTER;
    oldStep.observe = OBSERVE_AFTER;
  } else return false;
  return true;
}

/** 移動外のReact初回も、表示外のruntime/全fixtureをcopy差分に同居させない。 */
export function compareInitialReactCopyContract(
  previous: AuthoringExercise,
  current: AuthoringExercise,
) {
  if (previous.id !== 'react-ch01-l01-e01' || current.id !== previous.id)
    throw Error('Unexpected initial React learner contract identity');
  const normalized = structuredClone(previous);
  applyFixedCopyDelta(
    { exercises: [normalized] },
    { exercises: [current] },
    'react',
    'react-ch01-l01',
  );
  if (hashValue(normalized) !== hashValue(current))
    throw Error('Initial React learner delta execution/grading contract differs');
}

export function verifyLearnerMovement(
  originals: LearnerMovementOriginals | undefined,
  inventory: ReleaseInventory,
  baseline: { inventory: ReleaseInventory; sourceCommit: string; sourceRecordDigest: string },
  candidateContentCommit: string,
  declarationDigest: string,
  moves: Moves,
) {
  const carries = new Map<string, Carry>();
  if (!originals) return carries;
  const expected = pairs(moves);
  for (const side of ['previous', 'current'] as const) {
    const rows = originals[side];
    if (
      rows.length !== expected.length ||
      new Set(rows.map((row) => row.courseId + '/' + row.lessonId)).size !== expected.length ||
      expected.some(
        ([course, from, to]) =>
          !rows.some(
            (row) => row.courseId === course && row.lessonId === (side === 'previous' ? from : to),
          ),
      )
    )
      throw Error('Fixed learner projection coverage differs');
    for (const row of rows) {
      const source = side === 'previous' ? baseline.inventory : inventory;
      const lesson = source.courses
        .find((course) => course.id === row.courseId && course.publicationStatus === 'published')
        ?.lessons.find((lesson) => lesson.id === row.lessonId);
      if (
        !lesson ||
        row.projection.id !== row.lessonId ||
        hashValue(row.projection) !== lesson.learnerDigest
      )
        throw Error('Unmapped learner projection hash differs');
    }
  }
  for (const [courseId, fromLessonId, toLessonId] of expected) {
    const previous = originals.previous.find(
      (row) => row.courseId === courseId && row.lessonId === fromLessonId,
    )!;
    const current = originals.current.find(
      (row) => row.courseId === courseId && row.lessonId === toLessonId,
    )!;
    const mapped = mappedProjection(previous.projection, courseId, moves);
    const delta = applyFixedCopyDelta(mapped, current.projection, courseId, toLessonId);
    if (hashValue(mapped) !== hashValue(current.projection))
      throw Error('Learner projection visible delta differs');
    carries.set(
      courseId + '/' + toLessonId,
      CarrySchema.parse({
        kind: delta ? 'content-delta' : 'identical-move',
        courseId,
        fromLessonId,
        toLessonId,
        sourceCommit: baseline.sourceCommit,
        sourceRecordDigest: baseline.sourceRecordDigest,
        fromLearnerDigest: hashValue(previous.projection),
        candidateContentCommit,
        toLearnerDigest: hashValue(current.projection),
        movementDeclarationDigest: declarationDigest,
      }),
    );
  }
  return carries;
}
