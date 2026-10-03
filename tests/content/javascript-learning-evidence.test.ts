// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createJavascriptInputManifest,
  compareJavascriptLearningInputs,
  JavascriptInputManifestSchema,
} from '../../scripts/release/javascriptInputHashes';
import {
  JAVASCRIPT_FINAL_SMOKES,
  JAVASCRIPT_REQUIRED_JOURNEYS,
  validateJavascriptAgentLearning,
  validateJavascriptInputValidity,
  type JavascriptAgentLearningRecord,
  type JavascriptLearningExpectations,
  type JavascriptCandidateObservation,
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

/** unit専用の52/54 exact集合はactual compiled Courseからの取得を別に検証する。 */
function expectations(): JavascriptLearningExpectations {
  return {
    sourceCommit: finalSource,
    canonicalDistSha256: finalDist,
    draftCandidate: candidate('draft-learning'),
    finalCandidate: candidate('final-candidate'),
    revision: '2026-10-02.99',
    normalizedInputSha256: draftInput.normalizedInputSha256,
    lessons: Array.from({ length: 52 }, (_, index) => ({
      lessonId: `lesson-${String(index)}`,
      sourceHash: hash,
      lessonKind:
        index < 46
          ? ('standard' as const)
          : index < 51
            ? ('guided-project' as const)
            : ('capstone' as const),
      exercises: [
        {
          exerciseId: `exercise-${String(index)}`,
          completionRequirement: 'required' as const,
          requiredRequirementIds: [`requirement-${String(index)}`],
          scenarioIds: index === 51 ? ['scenario-1', 'scenario-2', 'scenario-3', 'scenario-4'] : [],
        },
        ...(index === 0
          ? ['javascript-ch03-l05-e02', 'javascript-ch03-l05-e03'].map((exerciseId) => ({
              exerciseId,
              completionRequirement: 'optional' as const,
              requiredRequirementIds: [exerciseId + '-rule'],
              scenarioIds: [],
            }))
          : []),
      ],
    })),
  };
}

/** private原本を模したunit fixture。fake approvedはこのtest内だけに閉じる。 */
function record(): JavascriptAgentLearningRecord {
  const expected = expectations();
  const operation = (id: string, download = false) => ({
    operationId: id,
    intentAt: '2026-10-02T10:00:00Z',
    completedAt: '2026-10-02T10:00:01Z',
    expected: '操作前の期待',
    actual: '実際の観測',
    status: 'passed' as const,
    evidence: [
      { evidenceId: `${id}-dom`, kind: 'dom' as const, sha256: hash, bytes: 10 },
      { evidenceId: `${id}-log`, kind: 'log' as const, sha256: hash, bytes: 10 },
      ...(download
        ? [{ evidenceId: `${id}-download`, kind: 'download' as const, sha256: hash, bytes: 10 }]
        : []),
    ],
  });
  return {
    schemaVersion: 2,
    courseId: 'javascript',
    releaseStatus: 'approved',
    verifiedSourceCommit: finalSource,
    canonicalDistSha256: finalDist,
    evaluationKind: 'agent-simulated-learning',
    previousAcceptance: 'one-real-javascript-beginner-entire-course',
    replacementAcceptance: 'three-independent-agents-each-entire-52-lessons-all-54-exercises',
    authorizationReference: 'unit-only',
    replacementReason: 'unit-only',
    limits: {
      realHumanNovice: 'not-demonstrated',
      naturalMisunderstandingFrequency: 'not-demonstrated',
      physicalDevice: 'not-demonstrated',
    },
    draftSourceCommit: source,
    draftCanonicalDistSha256: hash,
    draftCourseRevision: expected.revision,
    draftNormalizedInputSha256: expected.normalizedInputSha256,
    completionRequiredExerciseCount: 52,
    optionalExerciseCount: 2,
    evaluatedExerciseCountPerRole: 54,
    roles: (['JS-A', 'JS-B', 'JS-C'] as const).map((roleId, roleIndex) => ({
      roleId,
      persona: roleId,
      identity: {
        actorId: `${roleId}-actor`,
        sessionId: `${roleId}-session`,
        browserContextId: `${roleId}-context`,
        storageNamespace: `${roleId}-storage`,
        freshImportContextId: `${roleId}-import`,
        model: 'gpt-6.1-sol',
        reasoningEffort: 'high',
        startedEmpty: true,
        copiedState: false,
        solutionImplementationFixturePeekBeforeFirstAttempt: false,
        otherActorReportPeekBeforeCompletion: false,
        injectedPassingState: false,
      },
      startedAt: '2026-10-02T10:00:00Z',
      completedAt: '2026-10-02T11:00:00Z',
      browser: 'Chromium',
      viewport: { width: 1280, height: 720 },
      pageUrl,
      candidateRunId: expected.draftCandidate.runId,
      originalReport: {
        evidenceId: `${roleId}-report`,
        kind: 'report',
        sha256: String(roleIndex + 1).repeat(64),
        bytes: 10,
      },
      lessons: expected.lessons.map((lesson) => ({
        lessonId: lesson.lessonId,
        sourceHash: lesson.sourceHash,
        lessonKind: lesson.lessonKind,
        currentComplete: true,
        reading: operation(`${roleId}-${lesson.lessonId}-read`),
        exercises: lesson.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          completionRequirement: exercise.completionRequirement,
          gradingResult: 'pass',
          passedRequirementIds: [...exercise.requiredRequirementIds],
          executedScenarioIds: [...exercise.scenarioIds],
          operation: operation(`${roleId}-${exercise.exerciseId}`),
        })),
      })),
      journeys: JAVASCRIPT_REQUIRED_JOURNEYS.map((journeyId) => ({
        journeyId,
        operation: operation(`${roleId}-${journeyId}`, journeyId === 'export-fresh-import-resume'),
      })),
      finalSmokes: JAVASCRIPT_FINAL_SMOKES.map((smokeId) => ({
        smokeId,
        sourceCommit: finalSource,
        canonicalDistSha256: finalDist,
        pageUrl,
        candidateRunId: expected.finalCandidate.runId,
        operation: {
          ...operation(`${roleId}-${smokeId}`),
          intentAt: '2026-10-02T11:00:01Z',
          completedAt: '2026-10-02T11:00:02Z',
        },
      })),
      unresolvedCritical: 0,
      unresolvedImportant: 0,
      requiredUnconfirmed: 0,
    })),
    independentOriginalEvidenceReview: {
      reviewerId: 'independent-reviewer',
      reviewedAt: '2026-10-02T12:00:00Z',
      status: 'passed',
      originalDigestsVerified: true,
      identitiesAndFreshStatesVerified: true,
      intentActualEvidenceVerified: true,
      candidateRootObservationDigestsVerified: true,
      candidateObservations: [expected.draftCandidate, expected.finalCandidate].map(
        ({ phase, runId, rootObservationEvidenceSha256 }) => ({
          phase,
          runId,
          sha256: rootObservationEvidenceSha256,
        }),
      ),
      roleReports: ['JS-A', 'JS-B', 'JS-C'].map((roleId, index) => ({
        roleId: roleId as 'JS-A' | 'JS-B' | 'JS-C',
        sha256: String(index + 1).repeat(64),
      })),
    },
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

describe('JS independent all-course evidence', () => {
  it('各役52/54と全横断・final smoke・別原本reviewを受理するunit fixture', () => {
    expect(validateJavascriptAgentLearning(record(), expectations()).roles).toHaveLength(3);
  });
  it.each([
    'missing-role',
    'duplicate-lesson',
    'missing-optional',
    'stale-hash',
    'copied-state',
    'shared-context',
    'missing-journey',
    'missing-download',
    'wrong-final',
    'missing-log',
    'unconfirmed',
    'unreviewed-original',
    'draft',
    'missing-scenario',
    'missing-requirement',
    'incomplete-lesson',
    'pending-grade',
    'wrong-draft-url',
    'wrong-draft-run',
    'wrong-final-run',
    'public-url-before-deploy',
    'unreviewed-root-candidate',
    'stale-root-candidate-digest',
  ])('%sを完了に数えない', (failure) => {
    const input = record();
    const role = input.roles[0]!;
    switch (failure) {
      case 'missing-role':
        input.roles.pop();
        break;
      case 'duplicate-lesson':
        role.lessons[1]!.lessonId = role.lessons[0]!.lessonId;
        break;
      case 'missing-optional':
        role.lessons[0]!.exercises.pop();
        break;
      case 'stale-hash':
        role.lessons[0]!.sourceHash = finalDist;
        break;
      case 'copied-state':
        role.identity.copiedState = true;
        break;
      case 'shared-context':
        role.identity.freshImportContextId = input.roles[1]!.identity.browserContextId;
        break;
      case 'missing-journey':
        role.journeys.pop();
        break;
      case 'missing-download':
        role.journeys
          .find(({ journeyId }) => journeyId === 'export-fresh-import-resume')!
          .operation.evidence.pop();
        break;
      case 'wrong-final':
        role.finalSmokes[0]!.sourceCommit = source;
        break;
      case 'missing-log':
        role.lessons[0]!.reading.evidence.pop();
        break;
      case 'unconfirmed':
        role.requiredUnconfirmed = 1;
        break;
      case 'unreviewed-original':
        input.independentOriginalEvidenceReview.originalDigestsVerified = false;
        break;
      case 'draft':
        input.releaseStatus = 'draft';
        break;
      case 'missing-scenario':
        role.lessons[51]!.exercises[0]!.executedScenarioIds.pop();
        break;
      case 'missing-requirement':
        role.lessons[0]!.exercises[0]!.passedRequirementIds.pop();
        break;
      case 'incomplete-lesson':
        role.lessons[0]!.currentComplete = false;
        break;
      case 'pending-grade':
        role.lessons[0]!.exercises[0]!.gradingResult = 'pending';
        break;
      case 'wrong-draft-url':
        role.pageUrl = 'http://127.0.0.1:4214/tsumucode/';
        break;
      case 'wrong-draft-run':
        role.candidateRunId = 'other-run';
        break;
      case 'wrong-final-run':
        role.finalSmokes[0]!.candidateRunId = 'other-run';
        break;
      case 'public-url-before-deploy':
        role.finalSmokes[0]!.pageUrl = 'https://santa928.github.io/tsumucode/';
        break;
      case 'unreviewed-root-candidate':
        input.independentOriginalEvidenceReview.candidateRootObservationDigestsVerified = false;
        break;
      case 'stale-root-candidate-digest':
        input.independentOriginalEvidenceReview.candidateObservations[0]!.sha256 = finalDist;
        break;
    }
    expect(() => validateJavascriptAgentLearning(input, expectations())).toThrow();
  });
  it('操作後に期待を後付けした記録を拒否する', () => {
    const input = record();
    input.roles[0]!.lessons[0]!.reading.intentAt = '2026-10-02T12:00:00Z';
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

  it('S/P実local URLはroot観測bindingと一致したときだけ受理し本番HTTPSとは分ける', () => {
    const input = record();
    const expected = expectations();
    for (const role of input.roles) role.pageUrl = 'http://127.0.0.1:4214/tsumucode/';
    expect(() => validateJavascriptAgentLearning(input, expected)).toThrow();
    const actualDraftCandidate = {
      ...expected.draftCandidate,
      pageUrl: 'http://127.0.0.1:4214/tsumucode/',
    };
    expect(() =>
      validateJavascriptAgentLearning(input, { ...expected, draftCandidate: actualDraftCandidate }),
    ).not.toThrow();
    for (const role of input.roles)
      for (const smoke of role.finalSmokes) smoke.pageUrl = 'http://127.0.0.1:4292/tsumucode/';
    expect(() =>
      validateJavascriptAgentLearning(input, { ...expected, draftCandidate: actualDraftCandidate }),
    ).toThrow();
    expect(() =>
      validateJavascriptAgentLearning(input, {
        ...expected,
        draftCandidate: actualDraftCandidate,
        finalCandidate: { ...expected.finalCandidate, pageUrl: 'http://127.0.0.1:4292/tsumucode/' },
      }),
    ).not.toThrow();
    expect(() =>
      validateJavascriptAgentLearning(record(), {
        ...expected,
        finalCandidate: { ...expected.finalCandidate, sourceCommit: source },
      }),
    ).toThrow();
    expect(() =>
      validateJavascriptAgentLearning(record(), {
        ...expected,
        finalCandidate: { ...expected.finalCandidate, observedAt: '2026-10-02T10:00:00Z' },
      }),
    ).toThrow();
  });
});
