import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { movementIntentScope } from '../../../../scripts/release/v2/movement';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { QualificationSchema } from '../../../../scripts/release/v2/admission';
import { AppRecordSchema } from '../../../../scripts/release/v2/appRecord';
import { validateCapturedBaseline } from '../../../../scripts/release/v2/parent';
import { learnerCarryFixture, sealLearnerFixture } from './learnerCarryFixture';
import { releaseFixture } from './releaseFixture';

// 全データはunit専用の合成protocol。実公開/実Git認証/技術成功/人間受入の証拠を作らない。
// productionのstage Schemaを先取りしてparseせず、既存verifierへ未実装入力を渡す。
type Joint = Awaited<ReturnType<typeof learnerCarryFixture>>;
type StageBody = Joint['inputs']['declaration']['body'] & {
  stage: 'python-first' | 'react-after-python';
};
type StageInputs = Omit<Joint['inputs'], 'declaration'> & {
  declaration: Omit<Joint['inputs']['declaration'], 'body'> & { body: StageBody };
  predecessor?: unknown;
};
export interface StageFixture {
  inventory: Joint['inventory'];
  baseline: Joint['baseline'];
  inputs: StageInputs;
}

export function sealStageFixture<T extends StageFixture>(fixture: T): T {
  const { inputs, inventory, baseline } = fixture;
  const { declaration } = inputs;
  const { body } = declaration;
  body.baseline.inventoryDigest = hashValue(baseline.inventory);
  body.candidateInventoryDigest = hashValue(inventory);
  body.originalsDigest = hashValue({
    previous: inputs.previous,
    current: inputs.current,
    learnerOriginals: inputs.learnerOriginals,
  });
  if (inputs.predecessor !== undefined) body.predecessorDigest = hashValue(inputs.predecessor);
  declaration.bodyDigest = hashValue(body);
  for (const approval of declaration.approvals) {
    approval.bodyDigest = declaration.bodyDigest;
    approval.scopeDigest = movementIntentScope(body, approval.oldFixtureId);
    const { receiptDigest, ...unsigned } = approval;
    void receiptDigest;
    approval.receiptDigest = hashValue(unsigned);
  }
  const { declarationDigest, ...unsigned } = declaration;
  void declarationDigest;
  declaration.declarationDigest = hashValue(unsigned);
  return fixture;
}

function pythonFirst(joint: Joint): StageFixture {
  const inventory = structuredClone(joint.inventory);
  inventory.courses = inventory.courses.map((course) =>
    course.id === 'react'
      ? structuredClone(joint.baseline.inventory.courses.find((row) => row.id === 'react')!)
      : course,
  );
  const inputs: StageInputs = {
    ...structuredClone(joint.inputs),
    declaration: {
      ...structuredClone(joint.inputs.declaration),
      body: { ...structuredClone(joint.inputs.declaration.body), stage: 'python-first' },
    },
  };
  inputs.current = inputs.current.map((course) =>
    course.courseId === 'react'
      ? structuredClone(inputs.previous.find((row) => row.courseId === 'react')!)
      : course,
  );
  const body = inputs.declaration.body;
  body.moves = body.moves.filter((move) => move.courseId === 'python-basics');
  body.references = Object.fromEntries(
    Object.entries(body.references).filter(([id]) => id.startsWith('python-basics-')),
  );
  body.recheckLessons = body.recheckLessons.filter((lesson) => lesson.startsWith('python-basics/'));
  for (const side of ['previous', 'current'] as const)
    inputs.learnerOriginals[side] = inputs.learnerOriginals[side].filter(
      (row) => row.courseId === 'python-basics',
    );
  return sealStageFixture({ inventory, baseline: structuredClone(joint.baseline), inputs });
}

/** stage APIを呼ばず、手で導いた前段planを既存Schemaへ通す。fixture準備のTypeErrorをREDとしない。 */
function pythonHistory(python: StageFixture) {
  const template = releaseFixture();
  const prefix = (row: { courseId: string; lessonId: string }) => row.courseId + '/' + row.lessonId;
  const previous = new Map(
    python.baseline.inventory.courses.flatMap((course) =>
      course.lessons.map((lesson) => [course.id + '/' + lesson.id, lesson.learnerDigest] as const),
    ),
  );
  const rechecks = new Set(python.inputs.declaration.body.recheckLessons);
  const exact = 'python-basics/python-basics-ch01-l13';
  const copy = 'python-basics/python-basics-ch01-l12';
  const fresh = planRelease(python.inventory);
  const plan = {
    ...fresh,
    movementDeclarationDigest: python.inputs.declaration.declarationDigest,
    parent: {
      deploymentId: python.baseline.deploymentId,
      sourceRecordDigest: python.baseline.sourceRecordDigest,
    },
    targets: fresh.targets.filter((target) => {
      const lesson = prefix(target);
      if (target.kind === 'learning-engine') return !previous.has(lesson) || rechecks.has(lesson);
      if (target.kind !== 'content' && target.kind !== 'learning') return true;
      if (lesson === exact) return false;
      if (lesson === copy) return target.kind === 'content';
      return rechecks.has(lesson) || previous.get(lesson) !== target.inputDigest;
    }),
  };
  const lessonKeys = python.inventory.courses.flatMap((course) =>
    course.lessons.map((lesson) => course.id + '/' + lesson.id),
  );
  const allIds = python.inventory.courses.flatMap((course) =>
    course.lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.id)),
  );
  const pythonIds = python.inventory.courses
    .find((course) => course.id === 'python-basics')!
    .lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.id));
  const executionPlan = createExecutionPlan(
    plan,
    TEST_SUITES.map(({ suite, producerJobId, project }) => ({
      suite,
      producerJobId,
      project,
      tests: [
        {
          key: 'synthetic-stage-' + suite,
          exerciseIds:
            suite === 'browser-chromium-1' ? allIds : suite === 'native-python' ? pythonIds : [],
          lessonKeys: ['browser-chromium-1', 'browser-firefox', 'browser-webkit'].includes(suite)
            ? lessonKeys
            : [],
        },
      ],
    })),
    hashValue(template.snapshot.publicContent),
  );
  const candidate = {
    ...template.candidate,
    runId: '601',
    artifactId: '602',
    planDigest: hashValue({ plan, executionPlan }),
    recipe: {
      ...template.candidate.recipe,
      sourceCommit: python.inputs.declaration.body.candidateContentCommit,
    },
  };
  const qualification = QualificationSchema.parse({
    schemaVersion: 1,
    status: 'qualified',
    candidateDigest: hashValue(candidate),
    parent: plan.parent,
    qualifiedAt: '2026-11-04T10:00:00Z',
    technical: {
      status: 'technical-passed',
      expiresAt: '2026-11-04T14:00:00Z',
      candidateDigest: hashValue(candidate),
      buildAttempt: 1,
      verificationAttempts: [1],
      suites: executionPlan.requirements.map((row) => row.suite),
    },
    content: {
      status: 'approved',
      carriedLessons: lessonKeys.filter((lesson) => lesson.startsWith('react/')),
      newlyApprovedLessons: plan.targets
        .filter((target) => target.kind === 'content' && prefix(target) !== copy)
        .map(prefix),
      technicalRechecks: [],
      movementLearnerAcceptance: python.inputs.learnerOriginals.current.map((row) => {
        const fromLessonId =
          row.lessonId === 'python-basics-ch01-l12'
            ? 'python-basics-ch01-l08'
            : 'python-basics-ch01-l09';
        const old = python.inputs.learnerOriginals.previous.find(
          (old) => old.lessonId === fromLessonId,
        )!;
        return {
          kind: row.lessonId.endsWith('l12') ? 'content-delta' : 'identical-move',
          courseId: row.courseId,
          fromLessonId,
          toLessonId: row.lessonId,
          sourceCommit: python.baseline.sourceCommit,
          sourceRecordDigest: python.baseline.sourceRecordDigest,
          fromLearnerDigest: hashValue(old.projection),
          candidateContentCommit: candidate.recipe.sourceCommit,
          toLearnerDigest: hashValue(row.projection),
          movementDeclarationDigest: python.inputs.declaration.declarationDigest,
          ...(row.lessonId.endsWith('l12')
            ? { contentReceiptDigest: hashValue('synthetic-stage-module-review') }
            : {}),
        };
      }),
    },
    projects: plan.targets
      .filter((target) => target.kind === 'project')
      .map((target) => target.key),
  });
  const record = AppRecordSchema.parse({
    schemaVersion: 2,
    repository: candidate.repository,
    workflowHeadCommit: candidate.recipe.sourceCommit,
    candidate,
    deploymentId: '603',
    siteUrl: 'https://owner.github.io/site/',
    publicContentDigest: template.snapshot.publicContent.digest,
    inventoryDigest: hashValue(python.inventory),
    state: 'verified',
    qualificationDigest: hashValue(qualification),
    smokeDigest: hashValue('synthetic-stage-public-check'),
    observedAt: '2026-11-04T12:00:00Z',
  });
  const tagObject = `object ${candidate.recipe.sourceCommit}\ntype commit\ntag tsumucode-app-synthetic-python-first\ntagger Synthetic Unit <unit@example.invalid> 1793793600 +0000\n\n${JSON.stringify(record)}\n`;
  const proof = {
    ...template.capturedBaseline.proof,
    deploymentId: record.deploymentId,
    sourceCommit: candidate.recipe.sourceCommit,
    workflowHeadCommit: record.workflowHeadCommit,
    runId: candidate.runId,
    tag: 'refs/tags/tsumucode-app-synthetic-python-first',
    tagDigest: hashBytes(tagObject),
    artifactDigest: candidate.artifactDigest,
    artifactDigestFormat: 'canonical-dist-v1' as const,
    inventoryDigest: record.inventoryDigest,
    publicContentDigest: record.publicContentDigest,
    observedAt: '2026-11-05T01:00:00Z',
  };
  const captured = validateCapturedBaseline({
    proof,
    baseline: {
      deploymentId: proof.deploymentId,
      sourceCommit: proof.sourceCommit,
      artifactDigest: proof.artifactDigest,
      sourceRecordDigest: hashValue(proof),
      inventory: structuredClone(python.inventory),
    },
  });
  const oldProof = {
    ...template.capturedBaseline.proof,
    deploymentId: python.baseline.deploymentId,
    sourceCommit: python.baseline.sourceCommit,
    artifactDigest: python.baseline.artifactDigest,
    inventoryDigest: hashValue(python.baseline.inventory),
  };
  // stage起案前にjoint側の旧baselineもこの合成proofへ拘束済み。
  const priorCaptured = validateCapturedBaseline({ baseline: python.baseline, proof: oldProof });
  return {
    captured,
    predecessor: {
      proof,
      tagObject,
      qualification,
      bundle: {
        snapshot: {
          schemaVersion: 1,
          inventory: python.inventory,
          plan,
          publicContent: template.snapshot.publicContent,
          movementInputs: python.inputs,
        },
        executionPlan,
        candidate,
        capturedBaseline: priorCaptured,
      },
    },
  };
}

export async function stagedMovementFixture() {
  const joint = await learnerCarryFixture();
  const template = releaseFixture();
  const oldProof = {
    ...template.capturedBaseline.proof,
    deploymentId: joint.baseline.deploymentId,
    sourceCommit: joint.baseline.sourceCommit,
    artifactDigest: joint.baseline.artifactDigest,
    inventoryDigest: hashValue(joint.baseline.inventory),
  };
  joint.baseline.sourceRecordDigest = hashValue(oldProof);
  joint.inputs.declaration.body.baseline.sourceRecordDigest = joint.baseline.sourceRecordDigest;
  sealLearnerFixture(joint);
  const python = pythonFirst(joint);
  const { captured, predecessor } = pythonHistory(python);
  const inputs: StageInputs = {
    ...structuredClone(joint.inputs),
    declaration: {
      ...structuredClone(joint.inputs.declaration),
      body: { ...structuredClone(joint.inputs.declaration.body), stage: 'react-after-python' },
    },
    previous: structuredClone(python.inputs.current),
    predecessor,
  };
  const body = inputs.declaration.body;
  body.baseline = {
    deploymentId: captured.baseline.deploymentId,
    sourceCommit: captured.baseline.sourceCommit,
    sourceRecordDigest: captured.baseline.sourceRecordDigest,
    inventoryDigest: hashValue(captured.baseline.inventory),
  };
  body.candidateContentCommit = '6'.repeat(40);
  body.moves = body.moves.filter((move) => move.courseId === 'react');
  body.references = Object.fromEntries(
    Object.entries(body.references).filter(([id]) => id.startsWith('react-')),
  );
  body.intents = [];
  inputs.declaration.approvals = [];
  body.recheckLessons = body.recheckLessons.filter((lesson) => lesson.startsWith('react/'));
  for (const side of ['previous', 'current'] as const)
    inputs.learnerOriginals[side] = inputs.learnerOriginals[side].filter(
      (row) => row.courseId === 'react',
    );
  const react = sealStageFixture({
    inventory: structuredClone(joint.inventory),
    baseline: captured.baseline,
    inputs,
    history: predecessor,
  });
  return { joint, python, react };
}
