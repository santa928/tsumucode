// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { assertJavascriptFinalQualityWorkflow } from '../../scripts/release/verifyJavascriptQualityEvidence';
import {
  createJavascriptInputManifest,
  compareJavascriptLearningInputs,
  JavascriptInputManifestSchema,
} from '../../scripts/release/javascriptInputHashes';
import {
  JAVASCRIPT_FINAL_SMOKES,
  validateJavascriptAgentLearning,
  validateJavascriptInputValidity,
  type JavascriptAgentLearningRecord,
  type JavascriptLearningExpectations,
  type JavascriptCandidateObservation,
  getJavascriptLessonEvaluationCoverage,
  validateJavascriptManualRecord,
} from '../../scripts/release/javascriptQualityRecords';

const source = 'a'.repeat(40);
const finalSource = 'b'.repeat(40);
const hash = 'c'.repeat(64);
const finalDist = 'd'.repeat(64);
const pageUrl = 'http://127.0.0.1:4213/tsumucode/';
const frontend =
  'schemaVersion: 1\nid: frontend\ntitle: test\ndescription: test\npublicationStatus: published\nsteps:\n  - courseId: html-css\n    role: required\n    prerequisiteCourseIds: []\n';
const registration =
  '  - courseId: javascript\n    role: required\n    prerequisiteCourseIds: [html-css]\n';

/** これはunit専用の小さい入力。Git固定点/実教材/公開承認の証拠として使用しない。 */
function inputFiles(published = false): Map<string, Uint8Array> {
  return new Map(
    Object.entries({
      'content/javascript/course.yaml': `id: javascript\npublicationStatus: ${published ? 'published' : 'draft'}\nrevision: 2026-10-02.99\n`,
      'content/learning-paths/frontend.yaml': frontend + (published ? registration : ''),
      'package.json': '{}',
      'package-lock.json': '{}',
      'src/core/runtime/example.ts': 'export const value = 1;',
      'content/javascript/lesson.yaml': 'source: unchanged',
    }).map(([relative, text]) => [relative, new TextEncoder().encode(text)]),
  );
}
const draftInput = createJavascriptInputManifest(source, inputFiles());
const finalInput = createJavascriptInputManifest(finalSource, inputFiles(true));

/** 偽のroot観測bindingはUnit内だけに限定し、実候補の証拠へ使わない。 */
function candidate(phase: 'draft-learning' | 'final-candidate'): JavascriptCandidateObservation {
  return {
    observationKind: 'local-static-candidate',
    phase,
    runId: phase + '-unit-only',
    sourceCommit: phase === 'draft-learning' ? source : finalSource,
    canonicalDistSha256: phase === 'draft-learning' ? hash : finalDist,
    pageUrl,
    sourceTreeSha256: hash,
    helperDistTreeSha256: hash,
    manifestSha256: hash,
    configSha256: hash,
    helperSha256: hash,
    observedBy: 'root-unit-only',
    observedAt: phase === 'draft-learning' ? '2026-10-02T09:59:00Z' : '2026-10-02T11:00:01Z',
    rootObservationEvidenceSha256: hash,
  };
}

/** 教材単位の小さいUnit集合。実Courseの52教材数は公開Gateで別に検査する。 */
function expectations(): JavascriptLearningExpectations {
  return {
    sourceCommit: finalSource,
    canonicalDistSha256: finalDist,
    finalCandidate: candidate('final-candidate'),
    lessons: [
      { lessonId: 'lesson-one', learnerContentSha256: hash },
      { lessonId: 'lesson-two', learnerContentSha256: hash },
    ],
  };
}

/** 元の異なるSource/途中保存状態の原本を模すUnit fixture。実承認へ転用しない。 */
function record(): JavascriptAgentLearningRecord {
  const operation = (id: string, final = false) => ({
    operationId: id,
    intentAt: final ? '2026-10-02T11:00:02Z' : '2026-10-01T10:00:00Z',
    completedAt: final ? '2026-10-02T11:00:03Z' : '2026-10-01T10:00:01Z',
    expected: '表示教材から予測した内容',
    actual: '読解/操作の実観測',
    status: 'passed' as const,
    evidence: [
      { evidenceId: id + '-dom', kind: 'dom' as const, sha256: hash, bytes: 10 },
      { evidenceId: id + '-log', kind: 'log' as const, sha256: hash, bytes: 10 },
    ],
  });
  return {
    schemaVersion: 3,
    courseId: 'javascript',
    releaseStatus: 'approved',
    verifiedSourceCommit: finalSource,
    canonicalDistSha256: finalDist,
    evaluationKind: 'agent-simulated-learning',
    replacementAcceptance: 'three-independent-personas-once-per-new-lesson',
    authorizationReference: '2026-10-03T15:57+09:00-unit-only',
    limits: {
      realHumanNovice: 'not-demonstrated',
      naturalMisunderstandingFrequency: 'not-demonstrated',
      physicalDevice: 'not-demonstrated',
    },
    lessonEvaluations: expectations().lessons.flatMap((lesson) =>
      (['JS-A', 'JS-B', 'JS-C'] as const).map((roleId, index) => ({
        evaluationId: roleId + '-' + lesson.lessonId,
        lessonId: lesson.lessonId,
        roleId,
        persona: roleId,
        sourceCommit: source,
        sourceLessonHash: hash,
        learnerContentSha256: lesson.learnerContentSha256,
        identity: {
          actorId: roleId + '-actor',
          sessionId: roleId + '-session',
          browserContextId: roleId + '-context',
          storageNamespace: roleId + '-storage',
          model: 'gpt-6.1-sol' as const,
          reasoningEffort: 'high' as const,
          copiedState: false as const,
          solutionImplementationFixturePeekBeforeFirstAttempt: false as const,
          otherActorReportPeekBeforeCompletion: false as const,
          injectedPassingState: false as const,
        },
        reading: operation(roleId + '-' + lesson.lessonId + '-reading'),
        interaction: operation(roleId + '-' + lesson.lessonId + '-interaction'),
        originalReport: {
          evidenceId: roleId + '-report',
          kind: 'report' as const,
          sha256: String(index + 1).repeat(64),
          bytes: 10,
        },
        checkpoint: {
          evidenceId: roleId + '-checkpoint',
          kind: 'download' as const,
          sha256: hash,
          bytes: 10,
        },
        unresolvedCritical: 0,
        unresolvedImportant: 0,
        requiredUnconfirmed: 0,
      })),
    ),
    finalSmokes: JAVASCRIPT_FINAL_SMOKES.map((smokeId) => ({
      smokeId,
      performedBy: 'release-operator-unit-only',
      sourceCommit: finalSource,
      canonicalDistSha256: finalDist,
      pageUrl,
      candidateRunId: candidate('final-candidate').runId,
      operation: operation(smokeId, true),
    })),
    independentOriginalEvidenceReview: {
      reviewerId: 'independent-reviewer',
      reviewedAt: '2026-10-02T12:00:00Z',
      status: 'passed',
      originalDigestsVerified: true,
      learnerContentVerified: true,
      identitiesVerified: true,
      intentActualEvidenceVerified: true,
      reviewedReportSha256s: ['1', '2', '3'].map((digit) => digit.repeat(64)),
      finalCandidateObservationSha256: hash,
    },
    unresolvedCritical: 0,
    unresolvedImportant: 0,
    requiredUnconfirmed: 0,
  };
}

describe('JS draft/final learning input', () => {
  it('許可した2metadataだけの変更を列挙しdraft/finalを区別する', () => {
    expect(compareJavascriptLearningInputs(draftInput, finalInput)).toEqual([
      'content/javascript/course.yaml',
      'content/learning-paths/frontend.yaml',
    ]);
    expect(draftInput.sourceCommit).not.toBe(finalInput.sourceCommit);
  });
  it.each(['src/core/runtime/example.ts', 'content/javascript/lesson.yaml', 'package-lock.json'])(
    '%s変更をmetadata-onlyとして通さない',
    (relative) => {
      const files = inputFiles(true);
      files.set(relative, new TextEncoder().encode('changed'));
      expect(() =>
        compareJavascriptLearningInputs(
          draftInput,
          createJavascriptInputManifest(finalSource, files),
        ),
      ).toThrow('学習入力が変更');
    },
  );
  it('同じpublished inputをdraftの学習証拠として通さない', () => {
    expect(() => compareJavascriptLearningInputs(finalInput, finalInput)).toThrow('遷移');
  });
  it('Pathの既存Step変更とJS optional登録を拒否する', () => {
    for (const text of [
      frontend.replace('title: test', 'title: changed') + registration,
      frontend + registration.replace('role: required', 'role: optional'),
    ]) {
      const files = inputFiles(true);
      files.set('content/learning-paths/frontend.yaml', new TextEncoder().encode(text));
      expect(() =>
        compareJavascriptLearningInputs(
          draftInput,
          createJavascriptInputManifest(finalSource, files),
        ),
      ).toThrow();
    }
  });
  it('manifest内部hash偽装を拒否する', () => {
    const altered = structuredClone(finalInput);
    altered.entries[0]!.normalizedSha256 = hash;
    expect(() => compareJavascriptLearningInputs(draftInput, altered)).toThrow('内部hash');
  });
  it('実行設定を含まない旧v1 scopeを新しい学習入力の証拠にしない', () => {
    expect(() =>
      JavascriptInputManifestSchema.parse({
        ...draftInput,
        scope: 'javascript-learning-input-v1',
      }),
    ).toThrow();
  });
});

describe('JS教材単位の3persona評価', () => {
  it('古い別Source/保存状態の確認済み教材を全体hash/distの違いで再開始しない', () => {
    const input = record();
    expect(validateJavascriptAgentLearning(input, expectations()).lessonEvaluations).toHaveLength(
      6,
    );
    expect(input.lessonEvaluations[0]!.sourceCommit).not.toBe(input.verifiedSourceCommit);
    expect(input.lessonEvaluations[0]!.checkpoint).toBeDefined();
    expect(getJavascriptLessonEvaluationCoverage(input, expectations().lessons).pending).toEqual(
      [],
    );
  });
  it('新教材を追加すると既存教材を保全し、新教材3役だけを未確認として返す', () => {
    const input = record();
    const lessons = [
      ...expectations().lessons,
      { lessonId: 'new-lesson', learnerContentSha256: finalDist },
    ];
    expect(getJavascriptLessonEvaluationCoverage(input, lessons)).toMatchObject({
      confirmedLessonIds: ['lesson-one', 'lesson-two'],
      pending: [{ lessonId: 'new-lesson', missingRoleIds: ['JS-A', 'JS-B', 'JS-C'] }],
    });
    expect(input.lessonEvaluations).toHaveLength(6);
    expect(() => validateJavascriptAgentLearning(input, { ...expectations(), lessons })).toThrow(
      '新規教材',
    );
  });
  it('部分記録を実施済みの行だけ再利用し、未操作を成功へ補完しない', () => {
    const input = record();
    input.releaseStatus = 'draft';
    input.lessonEvaluations[1]!.interaction.status = 'pending';
    input.lessonEvaluations = input.lessonEvaluations.slice(0, 3);
    expect(getJavascriptLessonEvaluationCoverage(input, expectations().lessons).pending).toEqual([
      { lessonId: 'lesson-one', missingRoleIds: ['JS-B'] },
      { lessonId: 'lesson-two', missingRoleIds: ['JS-A', 'JS-B', 'JS-C'] },
    ]);
  });
  it('教材内容が変わった対象だけ未確認へ戻し、古い原本も保持する', () => {
    const input = record();
    const lessons = expectations().lessons.map((lesson, index) => ({
      ...lesson,
      learnerContentSha256: index === 0 ? finalDist : hash,
    }));
    expect(getJavascriptLessonEvaluationCoverage(input, lessons)).toMatchObject({
      confirmedLessonIds: ['lesson-two'],
      pending: [{ lessonId: 'lesson-one', missingRoleIds: ['JS-A', 'JS-B', 'JS-C'] }],
    });
    expect(input.lessonEvaluations[0]!.learnerContentSha256).toBe(hash);
  });
  it('本人承認の対象だけ必須にし、対象外の未確認を正確に保持する', () => {
    const input = record();
    const expected = expectations();
    input.lessonEvaluations = input.lessonEvaluations.slice(0, 3);
    input.acceptanceScope = {
      authorizationReference: '2026-10-03T19:13+09:00-unit-only',
      requiredLessonIds: ['lesson-one'],
      pendingOutsideScope: [{ lessonId: 'lesson-two', missingRoleIds: ['JS-A', 'JS-B', 'JS-C'] }],
    };
    const scoped = { ...expected, requiredLessonIds: ['lesson-one'] };
    expect(validateJavascriptAgentLearning(input, scoped).lessonEvaluations).toHaveLength(3);
    expect(() => validateJavascriptAgentLearning(input, expected)).toThrow('新規教材');
    input.acceptanceScope.pendingOutsideScope = [];
    expect(() => validateJavascriptAgentLearning(input, scoped)).toThrow('対象外');
  });
  it('記録が必須対象を削ったり、必須3役を省いたりしても通さない', () => {
    const input = record();
    const scoped = { ...expectations(), requiredLessonIds: ['lesson-one'] };
    expect(() => validateJavascriptAgentLearning(input, scoped)).toThrow('受入範囲');
    input.acceptanceScope = {
      authorizationReference: 'unit-only',
      requiredLessonIds: ['lesson-two'],
      pendingOutsideScope: [],
    };
    expect(() => validateJavascriptAgentLearning(input, scoped)).toThrow('受入範囲');
    input.acceptanceScope.requiredLessonIds = ['lesson-one'];
    input.lessonEvaluations.splice(0, 1);
    expect(() => validateJavascriptAgentLearning(input, scoped)).toThrow('新規教材');
  });
  it('旧指紋は元教材全Sourceと旧projectionが両方同じときだけ保持する', () => {
    const input = record();
    const lessons = expectations().lessons.map((lesson) => ({
      ...lesson,
      learnerContentSha256: finalDist,
      legacyFingerprint: { sourceLessonHash: hash, learnerContentSha256: hash },
    }));
    expect(getJavascriptLessonEvaluationCoverage(input, lessons).pending).toEqual([]);
    lessons[0]!.legacyFingerprint.sourceLessonHash = finalDist;
    expect(getJavascriptLessonEvaluationCoverage(input, lessons).pending).toEqual([
      { lessonId: 'lesson-one', missingRoleIds: ['JS-A', 'JS-B', 'JS-C'] },
    ]);
    lessons[0]!.legacyFingerprint.sourceLessonHash = hash;
    lessons[0]!.legacyFingerprint.learnerContentSha256 = finalDist;
    expect(getJavascriptLessonEvaluationCoverage(input, lessons).pending).toHaveLength(1);
    expect(input.lessonEvaluations[0]!.learnerContentSha256).toBe(hash);
  });
  it.each([
    'missing-role',
    'shared-actor',
    'shared-storage',
    'same-report',
    'missing-log',
    'unreviewed',
    'reviewer-is-actor',
    'missing-report-binding',
    'old-final-smoke',
    'missing-final-smoke',
    'unconfirmed',
    'duplicate-evaluation',
    'wrong-candidate',
    'late-intent',
    'early-review',
    'copied-operation',
    'conflicting-evidence',
    'smoke-self-review',
    'unverified-learner-content',
  ])('%sを教材評価合格へ読み替えない', (fault) => {
    const input = record();
    const row = input.lessonEvaluations[0]!;
    if (fault === 'missing-role') input.lessonEvaluations.splice(0, 1);
    if (fault === 'copied-operation')
      input.lessonEvaluations[3]!.reading = structuredClone(row.reading);
    if (fault === 'conflicting-evidence') {
      input.lessonEvaluations[3]!.reading.evidence[0]!.evidenceId =
        row.reading.evidence[0]!.evidenceId;
      input.lessonEvaluations[3]!.reading.evidence[0]!.sha256 = finalDist;
    }
    if (fault === 'smoke-self-review')
      input.independentOriginalEvidenceReview.reviewerId = input.finalSmokes[0]!.performedBy;
    if (fault === 'unverified-learner-content')
      input.independentOriginalEvidenceReview.learnerContentVerified = false;
    if (fault === 'shared-actor')
      row.identity.actorId = input.lessonEvaluations[1]!.identity.actorId;
    if (fault === 'shared-storage')
      row.identity.storageNamespace = input.lessonEvaluations[1]!.identity.storageNamespace;
    if (fault === 'same-report')
      row.originalReport.sha256 = input.lessonEvaluations[1]!.originalReport.sha256;
    if (fault === 'missing-log') row.interaction.evidence = row.interaction.evidence.slice(0, 1);
    if (fault === 'unreviewed')
      input.independentOriginalEvidenceReview.originalDigestsVerified = false;
    if (fault === 'reviewer-is-actor')
      input.independentOriginalEvidenceReview.reviewerId = row.identity.actorId;
    if (fault === 'missing-report-binding')
      input.independentOriginalEvidenceReview.reviewedReportSha256s = [];
    if (fault === 'old-final-smoke') input.finalSmokes[0]!.sourceCommit = source;
    if (fault === 'missing-final-smoke') input.finalSmokes.pop();
    if (fault === 'unconfirmed') row.requiredUnconfirmed = 1;
    if (fault === 'duplicate-evaluation') input.lessonEvaluations.push(structuredClone(row));
    if (fault === 'wrong-candidate') input.verifiedSourceCommit = source;
    if (fault === 'late-intent') row.reading.intentAt = '2026-10-03T12:00:00Z';
    if (fault === 'early-review')
      input.independentOriginalEvidenceReview.reviewedAt = '2026-10-02T10:00:00Z';
    expect(() => validateJavascriptAgentLearning(input, expectations())).toThrow();
  });
  it('input validityはS/DdraftとP/Dfinalを別に結ぶ', () => {
    const input = {
      schemaVersion: 2,
      courseId: 'javascript',
      releaseStatus: 'approved',
      verifiedSourceCommit: finalSource,
      canonicalDistSha256: finalDist,
      status: 'passed',
      draftCanonicalDistSha256: hash,
      draftInput,
      finalInput,
      draftCandidate: candidate('draft-learning'),
      finalCandidate: candidate('final-candidate'),
      metadataChanges: ['content/javascript/course.yaml', 'content/learning-paths/frontend.yaml'],
      affectedRevalidation: 'not-needed-identical-normalized-learning-input',
      artifactIdentity: 'draft-and-final-separately-bound',
      verifiedBy: 'independent-reviewer',
      verifiedAt: '2026-10-02T12:00:00Z',
    };
    expect(validateJavascriptInputValidity(input).draftCanonicalDistSha256).toBe(hash);
    expect(() => validateJavascriptInputValidity({ ...input, metadataChanges: [] })).toThrow();
    expect(() =>
      validateJavascriptInputValidity({ ...input, verifiedSourceCommit: source }),
    ).toThrow();
  });
});

describe('配信前の自動検査状態の正直な区別', () => {
  it('事前検査済みの宣言は最終Pages品質CI必須policyを伴い、pendingは通さない', () => {
    const input = {
      schemaVersion: 2,
      courseId: 'javascript',
      releaseStatus: 'approved',
      verifiedSourceCommit: finalSource,
      canonicalDistSha256: finalDist,
      checklistScope: 'pre-deploy',
      postDeployVerificationPolicy: 'revision-record',
      automatedGatesStatus: 'preflight-passed-final-ci-required',
      finalAutomatedGatePolicy: 'required-pages-quality-before-deploy',
      manualGatesStatus: 'passed',
      pendingItems: 0,
      failedItems: 0,
      allSiteQualityScope: 'unchanged',
      thresholds: 'unchanged',
      htmlHumanAcceptance: 'separate-not-substituted',
      unresolvedCritical: 0,
      unresolvedImportant: 0,
      requiredUnconfirmed: 0,
    };
    expect(() => {
      validateJavascriptManualRecord('releaseChecklist', input);
    }).not.toThrow();
    expect(() => {
      validateJavascriptManualRecord('releaseChecklist', {
        ...input,
        finalAutomatedGatePolicy: undefined,
      });
    }).toThrow();
    expect(() => {
      validateJavascriptManualRecord('releaseChecklist', {
        ...input,
        automatedGatesStatus: 'pending',
      });
    }).toThrow();
  });
});

it('実workflowの必須品質Gateの省略・失敗許容・deploy依存削除を拒否する', async () => {
  const source = await readFile('.github/workflows/pages.yml', 'utf8');
  expect(() => {
    assertJavascriptFinalQualityWorkflow(source);
  }).not.toThrow();
  const workflow = parse(source) as {
    jobs: {
      quality: { steps: { name: string; run?: string; 'continue-on-error'?: boolean }[] };
      deploy: { needs: string[] };
    };
  };
  const skipped = structuredClone(workflow);
  skipped.jobs.quality.steps = skipped.jobs.quality.steps.filter(
    ({ name }) => name !== 'Chromium full and cross-browser smoke',
  );
  expect(() => {
    assertJavascriptFinalQualityWorkflow(stringify(skipped));
  }).toThrow('必須');
  const allowed = structuredClone(workflow);
  allowed.jobs.quality.steps.find(({ name }) => name === 'Release quality')!['continue-on-error'] =
    true;
  expect(() => {
    assertJavascriptFinalQualityWorkflow(stringify(allowed));
  }).toThrow('必須');
  const premature = structuredClone(workflow);
  premature.jobs.deploy.needs = ['resolve'];
  expect(() => {
    assertJavascriptFinalQualityWorkflow(stringify(premature));
  }).toThrow('品質CI前');
});

it('同名stepのecho・失敗握り潰し・Artifact検査の差し替えを拒否する', async () => {
  const source = await readFile('.github/workflows/pages.yml', 'utf8');
  const original = parse(source) as {
    jobs: { quality: { steps: { name: string; run: string }[] } };
  };
  for (const fault of ['echo', 'ignore-failure', 'product-only']) {
    const changed = structuredClone(original);
    const name =
      fault === 'product-only' ? 'Bind candidate Artifact to approval' : 'Lighthouse budgets';
    const step = changed.jobs.quality.steps.find((step) => step.name === name)!;
    if (fault === 'echo') step.run = "echo 'npm run test:lighthouse'";
    if (fault === 'ignore-failure') step.run += ' || true';
    if (fault === 'product-only') step.run = step.run.replace('--artifact', '--product-only');
    expect(() => {
      assertJavascriptFinalQualityWorkflow(stringify(changed));
    }).toThrow('必須');
  }
});
