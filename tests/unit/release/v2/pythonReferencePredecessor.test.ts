// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { MovementInputsSchema, verifyMovementInputs } from '../../../../scripts/release/v2/movement';
import { verifyPythonMovementPredecessor } from '../../../../scripts/release/v2/movementPredecessor';
import { AppRecordSchema } from '../../../../scripts/release/v2/appRecord';
import { releaseFixture } from './releaseFixture';
import { pythonHistory, type StageFixture } from './stagedMovementFixture';
import { pythonReferenceFixture, sealPythonReferenceFixture } from './pythonReferenceFixture';

// 実Git原本を使うが、history/資格/技術成功/tagは全てunit専用の合成値。
let fixture: ReturnType<typeof pythonHistory>;
beforeAll(async () => {
  const row = await pythonReferenceFixture();
  const template = releaseFixture();
  const proof = { ...template.capturedBaseline.proof, deploymentId: row.baseline.deploymentId, sourceCommit: row.baseline.sourceCommit, artifactDigest: row.baseline.artifactDigest, inventoryDigest: hashValue(row.baseline.inventory) };
  row.baseline.sourceRecordDigest = hashValue(proof);
  sealPythonReferenceFixture(row);
  fixture = pythonHistory({ inventory: row.inventory, baseline: row.baseline, inputs: MovementInputsSchema.parse(row.inputs) } as StageFixture);
}, 60000);

function verify(row = fixture) {
  return verifyPythonMovementPredecessor(row.predecessor, row.captured.baseline, hashValue(row.predecessor), verifyMovementInputs);
}
function reseal(row: typeof fixture) {
  const h = row.predecessor;
  const split = h.tagObject.indexOf('\n\n');
  const record = AppRecordSchema.parse(JSON.parse(h.tagObject.slice(split + 2)));
  h.tagObject = h.tagObject.slice(0, split + 2) + JSON.stringify({ ...record, qualificationDigest: hashValue(h.qualification) }) + '\n';
  h.proof.tagDigest = hashBytes(h.tagObject);
  row.captured.baseline.sourceRecordDigest = hashValue(h.proof);
}
it('新markerの固定4carryを次段へ結び28移動/10意図のsummaryを保持する', () => {
  expect(fixture.predecessor.qualification.content.movementLearnerAcceptance).toHaveLength(4);
  expect(verify()).toMatchObject({ movedFixtureCount: 28, replacementIntentCount: 10, stage: 'python-first' });
});
it.each(['missing', 'duplicate', 'extra-subject'] as const)('前段carryの%sを外側history再hashでも拒否する', mutation => {
  const row = structuredClone(fixture);
  const carries = row.predecessor.qualification.content.movementLearnerAcceptance!;
  if (mutation === 'missing') carries.pop();
  if (mutation === 'duplicate') carries[3] = carries[2]!;
  if (mutation === 'extra-subject') { carries[3]!.fromLessonId = 'python-basics-ch01-l04'; carries[3]!.toLessonId = 'python-basics-ch01-l04'; }
  reseal(row);
  expect(() => verify(row)).toThrow();
});
it.each(['sourceCommit', 'sourceRecordDigest', 'fromLearnerDigest', 'toLearnerDigest', 'candidateContentCommit', 'movementDeclarationDigest'] as const)('reference carryの%sを外側history再hashでも拒否する', field => {
  const row = structuredClone(fixture);
  const carry = row.predecessor.qualification.content.movementLearnerAcceptance![2]!;
  carry[field] = field.endsWith('Commit') ? '0'.repeat(40) : '0'.repeat(64);
  reseal(row);
  expect(() => verify(row)).toThrow(/consume|declaration/iu);
});
