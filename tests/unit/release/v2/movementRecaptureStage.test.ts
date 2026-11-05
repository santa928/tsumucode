// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { AppRecordSchema } from '../../../../scripts/release/v2/appRecord';
import { createExecutionPlan } from '../../../../scripts/release/v2/executionPlan';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import {
  consumeVerifiedMovement,
  verifyMovementInputs,
} from '../../../../scripts/release/v2/movement';
import { validateCapturedBaseline } from '../../../../scripts/release/v2/parent';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { sealStageFixture, stagedMovementFixture } from './stagedMovementFixture';

// 1段historyとrecaptureの合成protocol対。実公開・実技術成功・人間受入の証拠ではない。
describe('recapture付きPython前段からReact後続へのscope接続', () => {
  let fixture: Awaited<ReturnType<typeof stagedMovementFixture>>;
  beforeAll(async () => {
    fixture = await stagedMovementFixture();
  }, 30000);

  function recapturedReact() {
    const row = structuredClone(fixture.react);
    const history = row.history;
    const prior = history.bundle;
    const original = prior.capturedBaseline;
    const proof = { ...original.proof, observedAt: '2026-11-04T09:30:00.000Z' };
    const current = validateCapturedBaseline({
      baseline: { ...original.baseline, sourceRecordDigest: hashValue(proof) },
      proof,
    });
    prior.capturedBaseline = current;
    prior.snapshot.movementInputs.baselineProofs = {
      original: original.proof,
      current: current.proof,
    };
    // 元decl/10approval/元carry scopeは変更しない。実buildがfreezeする親だけfreshになる。
    prior.snapshot.plan.parent = {
      deploymentId: current.baseline.deploymentId,
      sourceRecordDigest: current.baseline.sourceRecordDigest,
    };
    history.qualification.parent = prior.snapshot.plan.parent;
    prior.executionPlan = createExecutionPlan(
      prior.snapshot.plan,
      prior.executionPlan.testManifests,
      hashValue(prior.snapshot.publicContent),
    );
    prior.candidate.planDigest = hashValue({
      plan: prior.snapshot.plan,
      executionPlan: prior.executionPlan,
    });
    history.qualification.candidateDigest = hashValue(prior.candidate);
    history.qualification.technical.candidateDigest = hashValue(prior.candidate);
    const split = history.tagObject.indexOf('\n\n');
    if (split < 0) throw Error('Expected synthetic annotated tag');
    const record = AppRecordSchema.parse(JSON.parse(history.tagObject.slice(split + 2)) as unknown);
    const updated = AppRecordSchema.parse({
      ...record,
      candidate: prior.candidate,
      qualificationDigest: hashValue(history.qualification),
    });
    history.tagObject = history.tagObject.slice(0, split + 2) + JSON.stringify(updated) + '\n';
    history.proof.tagDigest = hashBytes(history.tagObject);
    const bound = validateCapturedBaseline({
      baseline: { ...row.baseline, sourceRecordDigest: hashValue(history.proof) },
      proof: history.proof,
    });
    row.inputs.declaration.body.baseline.sourceRecordDigest = bound.baseline.sourceRecordDigest;
    const freshProof = { ...bound.proof, observedAt: '2026-11-05T02:00:00.000Z' };
    const fresh = validateCapturedBaseline({
      baseline: { ...bound.baseline, sourceRecordDigest: hashValue(freshProof) },
      proof: freshProof,
    });
    row.baseline = fresh.baseline;
    row.inputs.baselineProofs = { original: bound.proof, current: fresh.proof };
    return sealStageFixture(row);
  }

  it('前段/後段とも元scopeとfresh親を分離し28+10を保持する', () => {
    const row = recapturedReact();
    expect(row.history.bundle.snapshot.movementInputs.declaration).toEqual(
      fixture.python.inputs.declaration,
    );
    const oldScope = fixture.python.inputs.declaration.body.baseline.sourceRecordDigest;
    expect(
      row.history.qualification.content.movementLearnerAcceptance?.every(
        (evidence) => evidence.sourceRecordDigest === oldScope,
      ),
    ).toBe(true);
    expect(() => verifyMovementInputs(row.inputs, row.inventory, row.baseline)).not.toThrow();
    const movement = verifyMovementInputs(row.inputs, row.inventory, row.baseline);
    const consumed = consumeVerifiedMovement(movement, row.inventory, row.baseline);
    expect(consumed?.predecessorSummary).toMatchObject({
      movedFixtureCount: 28,
      replacementIntentCount: 10,
      movementDeclarationDigest: fixture.python.inputs.declaration.declarationDigest,
    });
    expect(planRelease(row.inventory, row.baseline, movement).parent?.sourceRecordDigest).toBe(
      row.baseline.sourceRecordDigest,
    );
  });

  it('前段元proof改変を後段の外側history hash再計算で隠さない', () => {
    const row = recapturedReact();
    const proofs = row.history.bundle.snapshot.movementInputs.baselineProofs;
    if (!proofs) throw Error('Expected original/fresh proofs in synthetic predecessor');
    proofs.original.observedAt = '2026-11-04T09:00:00.000Z';
    sealStageFixture(row);
    expect(() => verifyMovementInputs(row.inputs, row.inventory, row.baseline)).toThrow(
      /baseline.*proof|proof.*hash/iu,
    );
  });
});
