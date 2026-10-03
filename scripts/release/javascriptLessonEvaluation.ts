import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import type { CourseManifest, Lesson } from '../../src/core/content/types';
import { compileCourse } from '../content/compileCourse';
import { getJavascriptLessonEvaluationCoverage } from './javascriptQualityRecords';

/** 初学者が読む/操作する教材だけを固定する。採点内部・Runtime・配信予算は技術Gateで検証する。 */
export function javascriptLearnerContentSha256(
  lesson: Lesson,
  glossary: CourseManifest['glossary'],
  assets: ReadonlyMap<string, Uint8Array>,
): string {
  const { completion, nextLessonId, prerequisiteLessonIds, ...learnerLesson } = lesson;
  void completion;
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
          steps: exercise.steps.map(({ validationRuleIds, ...step }) => {
            void validationRuleIds;
            return step;
          }),
          validationFeedback: validationRules.map(({ label, feedback }) => ({ label, feedback })),
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
    lessons.map((lesson) => ({
      lessonId: lesson.id,
      learnerContentSha256: javascriptLearnerContentSha256(lesson, runtime.glossary, assets),
    })),
  );
  console.log(JSON.stringify({ confirmedLessonIds, pending }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
