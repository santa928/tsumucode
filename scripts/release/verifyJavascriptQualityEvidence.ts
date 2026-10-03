import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { compileCourse } from '../content/compileCourse';
import {
  computeLessonSourceHash,
  ContentReviewLedgerSchema,
  verifyReviewLedger,
} from '../content/verifyContentReview';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { exerciseRequirementIds } from '../../src/core/content/exerciseRequirementIds';
import { resolveReleaseCourseContract } from './releaseCourseContracts';
import { readJavascriptLearningInput } from './javascriptInputHashes';
import {
  validateJavascriptAgentLearning,
  validateJavascriptInputValidity,
  validateJavascriptManualRecord,
  JavascriptFinalCodeReviewSchema,
  JAVASCRIPT_REQUIRED_JOURNEYS,
  type JavascriptLearningExpectations,
} from './javascriptQualityRecords';
import type { JavascriptReleaseApproval } from './javascriptReleaseSchema';

const execFileAsync = promisify(execFile);
const contract = resolveReleaseCourseContract('javascript');
export const JAVASCRIPT_REQUIRED_VISUAL_SCREENS = [
  'home',
  'frontend-path',
  'javascript-map',
  'javascript-slide',
  'javascript-exercise',
  'javascript-library',
  'javascript-guided-project',
  'javascript-capstone',
].flatMap((screen) => ['1280x720', '390x844'].map((viewport) => `${screen}@${viewport}`));

/** compileで消費した実Lesson directoryをID/hash集合へ結び、未読/staleを拒否する。 */
async function lessonSourceHashes(courseRoot: string): Promise<ReadonlyMap<string, string>> {
  const hashes = new Map<string, string>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('JS内容reviewへsymlinkを含められません');
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name === 'lesson.yaml') {
        const source = parse(await readFile(absolute, 'utf8')) as { readonly id?: unknown };
        if (typeof source.id !== 'string' || hashes.has(source.id))
          throw new Error('JS Lesson IDが不正/重複しています');
        hashes.set(source.id, await computeLessonSourceHash(directory));
      }
    }
  };
  await visit(courseRoot);
  return hashes;
}

/** Actionsがprivate原本を読んだと主張せず、固定public記録と独立原本照合承認を検査する。 */
export async function verifyJavascriptQualityEvidence(
  repositoryRoot: string,
  approval: JavascriptReleaseApproval,
  sources: ReadonlyMap<string, string>,
): Promise<void> {
  const record = (name: keyof JavascriptReleaseApproval['records']): unknown => {
    const source = sources.get(name);
    if (source === undefined) throw new Error(`JS品質記録がありません: ${name}`);
    return parse(source) as unknown;
  };
  const { runtime: course } = await compileCourse(path.join(repositoryRoot, contract.sourceRoot));
  const chapters = course.phases.flatMap(({ chapters }) => chapters);
  const lessons = chapters.flatMap(({ lessons }) => lessons);
  if (
    course.id !== contract.courseId ||
    course.phases.length !== 4 ||
    chapters.length !== 14 ||
    lessons.length !== 52 ||
    lessons.filter(({ kind }) => kind === 'standard').length !== 46 ||
    lessons.filter(({ kind }) => kind === 'guided-project').length !== 5 ||
    lessons.filter(({ kind }) => kind === 'capstone').length !== 1 ||
    lessons.reduce((sum, { estimatedMinutes }) => sum + estimatedMinutes, 0) !== 1010
  ) {
    throw new Error('JS実教材が52/46+5+1/14/4/1010の公開契約と一致しません');
  }
  const hashes = await lessonSourceHashes(path.join(repositoryRoot, contract.sourceRoot));
  const review = ContentReviewLedgerSchema.parse(record('contentReview'));
  if (
    review.releaseStatus !== 'approved' ||
    review.lessons.map(({ lessonId }) => lessonId).join('\0') !==
      lessons.map(({ id }) => id).join('\0')
  )
    throw new Error('JS全52内容reviewの承認/順序が不一致です');
  verifyReviewLedger(review, hashes);
  const validity = validateJavascriptInputValidity(record('inputValidity'));
  if (
    validity.verifiedSourceCommit !== approval.verifiedSourceCommit ||
    validity.canonicalDistSha256 !== approval.canonicalDistSha256
  )
    throw new Error('JS input validityのP/Dfinal bindingが異なります');
  await execFileAsync(
    'git',
    [
      'merge-base',
      '--is-ancestor',
      validity.draftInput.sourceCommit,
      approval.verifiedSourceCommit,
    ],
    { cwd: repositoryRoot },
  );
  for (const declared of [validity.draftInput, validity.finalInput]) {
    const actual = await readJavascriptLearningInput(repositoryRoot, declared.sourceCommit);
    if (canonicalJson(actual) !== canonicalJson(declared))
      throw new Error('学習入力manifestが固定Git実体と一致しません');
  }
  const expected: JavascriptLearningExpectations = {
    sourceCommit: approval.verifiedSourceCommit,
    canonicalDistSha256: approval.canonicalDistSha256,
    revision: course.revision,
    normalizedInputSha256: validity.finalInput.normalizedInputSha256,
    draftCandidate: validity.draftCandidate,
    finalCandidate: validity.finalCandidate,
    lessons: lessons.map((lesson) => ({
      lessonId: lesson.id,
      sourceHash: hashes.get(lesson.id) ?? '',
      lessonKind: lesson.kind,
      exercises: lesson.exercises.map((exercise) => ({
        exerciseId: exercise.id,
        completionRequirement:
          lesson.completion.kind === 'capstone' ||
          lesson.completion.requiredExerciseIds.includes(exercise.id)
            ? 'required'
            : 'optional',
        requiredRequirementIds: exerciseRequirementIds(exercise),
        scenarioIds: exercise.interactionScenarios?.map(({ id }) => id) ?? [],
      })),
    })),
  };
  const learning = validateJavascriptAgentLearning(record('agentLearning'), expected);
  if (
    learning.draftSourceCommit !== validity.draftInput.sourceCommit ||
    learning.draftCanonicalDistSha256 !== validity.draftCanonicalDistSha256 ||
    learning.draftNormalizedInputSha256 !== validity.draftInput.normalizedInputSha256
  ) {
    throw new Error('模擬学習S/Ddraftとinput validityが一致しません');
  }
  validateJavascriptManualRecord(
    'visualReview',
    record('visualReview'),
    JAVASCRIPT_REQUIRED_VISUAL_SCREENS,
  );
  validateJavascriptManualRecord(
    'accessibilityManual',
    record('accessibilityManual'),
    JAVASCRIPT_REQUIRED_JOURNEYS,
  );
  validateJavascriptManualRecord('releaseChecklist', record('releaseChecklist'));
  validateJavascriptManualRecord('finalCodeReview', record('finalCodeReview'));
  const codeReview = JavascriptFinalCodeReviewSchema.parse(record('finalCodeReview'));
  if (codeReview.productTreeSha256 !== approval.candidateTreeSha256)
    throw new Error('最終コードreviewのProduct treeが承認対象と異なります');
  await execFileAsync(
    'git',
    ['merge-base', '--is-ancestor', codeReview.baseCommit, approval.verifiedSourceCommit],
    { cwd: repositoryRoot },
  );
}
