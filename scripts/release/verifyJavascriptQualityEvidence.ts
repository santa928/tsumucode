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
import {
  javascriptLearnerContentSha256,
  javascriptLearnerContentSha256V1,
} from './javascriptLessonEvaluation';
import { resolveReleaseCourseContract } from './releaseCourseContracts';
import { readJavascriptLearningInput } from './javascriptInputHashes';
import {
  validateJavascriptAgentLearning,
  validateJavascriptInputValidity,
  validateJavascriptManualRecord,
  JavascriptFinalCodeReviewSchema,
  JavascriptReleaseChecklistSchema,
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

/** 事前検査済みの記録でも、既存全品質CI成功前の配信を許さない。 */
export function assertJavascriptFinalQualityWorkflow(source: string): void {
  const workflow = parse(source) as {
    jobs?: Record<
      string,
      {
        needs?: unknown;
        if?: unknown;
        'continue-on-error'?: unknown;
        steps?: { name?: string; run?: string; if?: unknown; 'continue-on-error'?: unknown }[];
      }
    >;
  };
  const required = new Map([
    [
      'Release quality',
      './scripts/docker-compose.sh run --rm -e BASE_PATH app npm run check:release',
    ],
    [
      'Bundle artifact preflight',
      './scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:bundle',
    ],
    [
      'Static artifact gate',
      './scripts/docker-compose.sh run --rm app npm run release:check -- --course-id "$RELEASE_COURSE_ID"',
    ],
    [
      'Chromium full and cross-browser smoke',
      './scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:e2e',
    ],
    [
      'Performance budgets',
      './scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:performance:browser',
    ],
    [
      'Lighthouse budgets',
      './scripts/docker-compose.sh run --rm -e BASE_PATH app npm run test:lighthouse',
    ],
    [
      'Bind candidate Artifact to approval',
      './scripts/docker-compose.sh run --rm app npm run release:approval -- --artifact --course-id "$RELEASE_COURSE_ID" --actual-output /workspace/.release-hashes',
    ],
  ]);
  const quality = workflow.jobs?.quality;
  const deploy = workflow.jobs?.deploy;
  const dispatch =
    "github.event_name == 'workflow_dispatch' && inputs.deploy == true && github.ref == 'refs/heads/main'";
  if (
    !quality ||
    !deploy ||
    quality.if !== dispatch ||
    deploy.if !== dispatch ||
    quality['continue-on-error'] !== undefined
  )
    throw new Error('最終品質CIとmain配信条件が不正です');
  if (!Array.isArray(deploy.needs) || !deploy.needs.includes('quality'))
    throw new Error('最終品質CI前の配信を許可できません');
  for (const [name, command] of required) {
    const step = quality.steps?.find((step) => step.name === name);
    if (
      step?.run?.trim().replace(/\s+/gu, ' ') !== command ||
      step['continue-on-error'] !== undefined ||
      (step.if !== undefined &&
        !(
          name === 'Bind candidate Artifact to approval' &&
          step.if === "needs.resolve.outputs.release_mode == 'candidate'"
        ))
    )
      throw new Error('必須の最終品質CIが不正です: ' + name);
  }
}

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
  const { runtime: course, assets } = await compileCourse(
    path.join(repositoryRoot, contract.sourceRoot),
  );
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
    finalCandidate: validity.finalCandidate,
    requiredLessonIds: contract.personaAcceptanceLessonIds,
    lessons: lessons.map((lesson) => ({
      lessonId: lesson.id,
      learnerContentSha256: javascriptLearnerContentSha256(lesson, course.glossary, assets),
      legacyFingerprint: {
        sourceLessonHash: hashes.get(lesson.id)!,
        learnerContentSha256: javascriptLearnerContentSha256V1(lesson, course.glossary, assets),
      },
    })),
  };
  validateJavascriptAgentLearning(record('agentLearning'), expected);
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
  const checklist = JavascriptReleaseChecklistSchema.parse(record('releaseChecklist'));
  if (checklist.automatedGatesStatus === 'preflight-passed-final-ci-required') {
    assertJavascriptFinalQualityWorkflow(
      await readFile(path.join(repositoryRoot, '.github/workflows/pages.yml'), 'utf8'),
    );
  }
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
