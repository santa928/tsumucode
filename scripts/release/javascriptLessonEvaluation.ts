import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import type { CourseManifest, Lesson } from '../../src/core/content/types';
import { compileCourse } from '../content/compileCourse';
import { computeLessonSourceHash } from '../content/verifyContentReview';
import { resolveReleaseCourseContract } from './releaseCourseContracts';
import { getJavascriptLessonEvaluationCoverage } from './javascriptQualityRecords';

/** 初学者が読む/操作する教材だけを固定する。採点内部・Runtime・配信予算は技術Gateで検証する。 */
function learnerContentSha256(
  lesson: Lesson,
  glossary: CourseManifest['glossary'],
  assets: ReadonlyMap<string, Uint8Array>,
  includeRequired: boolean,
): string {
  const { completion, nextLessonId, prerequisiteLessonIds, ...learnerLesson } = lesson;
  void nextLessonId;
  void prerequisiteLessonIds;
  const visible = {
    ...learnerLesson,
    ...(lesson.kind === 'standard'
      ? {}
      : {
          project: {
            brief: lesson.project.brief,
            guide: lesson.project.guide,
            checklist: lesson.project.checklist.map(({ label, required }) => ({ label, required })),
          },
        }),
    exercises: lesson.exercises.map(
      ({
        runtime,
        interactionScenarios,
        validationRules,
        workspaceId,
        countsTowardStandardExerciseTotal,
        ...exercise
      }) => {
        void runtime;
        void interactionScenarios;
        void workspaceId;
        void countsTowardStandardExerciseTotal;
        return {
          ...exercise,
          ...(includeRequired && completion.kind !== 'capstone'
            ? { requiredForCompletion: completion.requiredExerciseIds.includes(exercise.id) }
            : {}),
          steps: exercise.steps.map(({ validationRuleIds, ...step }) => {
            void validationRuleIds;
            return step;
          }),
          validationFeedback: validationRules.map(({ label, required, feedback }) => ({
            label,
            ...(includeRequired ? { required } : {}),
            feedback,
          })),
        };
      },
    ),
    glossary: lesson.glossaryRefs.map((id) => {
      const entry = glossary.find((entry) => entry.id === id);
      if (!entry) throw new Error(`教材評価の用語参照がありません: ${id}`);
      return entry;
    }),
    assetSha256s: [
      ...lesson.slides.flatMap(({ assets }) => assets),
      ...lesson.exercises.flatMap(({ assets }) => assets),
    ].map((asset) => {
      const bytes = assets.get(asset.path.replace(/^generated\/content\//u, ''));
      if (!bytes) throw new Error(`教材評価の画像/Assetがありません: ${asset.path}`);
      return { path: asset.path, sha256: createHash('sha256').update(bytes).digest('hex') };
    }),
  };
  return createHash('sha256').update(canonicalJson(visible)).digest('hex');
}

/** 必須/任意の可視区分とfeedbackの必須判定を含む現行教材projection。 */
export function javascriptLearnerContentSha256(
  lesson: Lesson,
  glossary: CourseManifest['glossary'],
  assets: ReadonlyMap<string, Uint8Array>,
): string {
  return learnerContentSha256(lesson, glossary, assets, true);
}

/** 移行専用の旧v1 projection。単独で現行教材の確認済判定に使わない。 */
export function javascriptLearnerContentSha256V1(
  lesson: Lesson,
  glossary: CourseManifest['glossary'],
  assets: ReadonlyMap<string, Uint8Array>,
): string {
  return learnerContentSha256(lesson, glossary, assets, false);
}

/** draftの部分記録から済/未済を読み取り報告する。実績や承認ファイルを生成しない。 */
async function main(args: readonly string[]): Promise<void> {
  const recordIndex = args.indexOf('--record');
  const recordPath = recordIndex < 0 ? undefined : args[recordIndex + 1];
  if (!recordPath || recordPath.startsWith('--'))
    throw new Error('--recordへ教材評価台帳が必要です');
  const { runtime, assets } = await compileCourse(path.resolve('content/javascript'));
  const lessons = runtime.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );
  const record: unknown = parse(await readFile(recordPath, 'utf8'));
  const { confirmedLessonIds, pending } = getJavascriptLessonEvaluationCoverage(
    record,
    await Promise.all(
      lessons.map(async (lesson) => ({
        lessonId: lesson.id,
        learnerContentSha256: javascriptLearnerContentSha256(lesson, runtime.glossary, assets),
        legacyFingerprint: {
          sourceLessonHash: await computeLessonSourceHash(
            path.resolve(
              'content/javascript/chapters',
              lesson.id.slice(0, -4),
              'lessons',
              lesson.id,
            ),
          ),
          learnerContentSha256: javascriptLearnerContentSha256V1(lesson, runtime.glossary, assets),
        },
      })),
    ),
  );
  const required = resolveReleaseCourseContract('javascript')
    .personaAcceptanceLessonIds as readonly string[];
  console.log(
    JSON.stringify(
      {
        confirmedLessonIds,
        pending,
        requiredLessonIds: required,
        requiredPending: pending.filter(({ lessonId }) => required.includes(lessonId)),
        pendingOutsideScope: pending.filter(({ lessonId }) => !required.includes(lessonId)),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
