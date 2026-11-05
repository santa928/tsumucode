// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  consumeVerifiedMovement,
  verifyMovementInputs,
} from '../../../../scripts/release/v2/movement';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { validateCapturedBaseline } from '../../../../scripts/release/v2/parent';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { readMovementBaselineProofs } from '../../../../scripts/release/v2/movementBaseline';
import {
  captureAtTwoTimes,
  FRESH_CAPTURE_TIME,
  movementRecaptureFixture,
  ORIGINAL_CAPTURE_TIME,
} from './movementRecaptureFixture';

describe('宣言がbindした元proofとfresh再captureの時刻だけの整合', () => {
  let fixture: Awaited<ReturnType<typeof movementRecaptureFixture>>;
  beforeAll(async () => {
    fixture = await movementRecaptureFixture();
  }, 30000);
  const verify = (row = fixture) =>
    verifyMovementInputs(row.inputs, row.bound.inventory, row.freshBaseline);

  it('既存captureBaselineの実経路は同じtemp Git/親/API/public bytesでも時刻だけでdigestが変わる', async () => {
    const pair = await captureAtTwoTimes();
    expect(pair.original.proof.observedAt).toBe(ORIGINAL_CAPTURE_TIME);
    expect(pair.current.proof.observedAt).toBe(FRESH_CAPTURE_TIME);
    expect({ ...pair.original.proof, observedAt: null }).toEqual({
      ...pair.current.proof,
      observedAt: null,
    });
    expect(pair.original.baseline.sourceRecordDigest).toBe(hashValue(pair.original.proof));
    expect(pair.current.baseline.sourceRecordDigest).toBe(hashValue(pair.current.proof));
    expect(pair.current.baseline.sourceRecordDigest).not.toBe(
      pair.original.baseline.sourceRecordDigest,
    );
    expect({ ...pair.original.baseline, sourceRecordDigest: null }).toEqual({
      ...pair.current.baseline,
      sourceRecordDigest: null,
    });
  });

  // Break: 元body/10approvalをfresh時刻で再署名するか、fresh proofの真正hashを検証しない。
  it('optional proof対を示せば元宣言scopeを保ちfresh実親のplanへ接続できる', () => {
    expect(
      validateCapturedBaseline({
        baseline: fixture.freshBaseline,
        proof: fixture.inputs.baselineProofs.current,
      }).baseline,
    ).toEqual(fixture.freshBaseline);
    const snapshot = structuredClone(fixture.inputs.declaration);
    expect(() => verify()).not.toThrow();
    const movement = verify();
    const consumed = consumeVerifiedMovement(
      movement,
      fixture.bound.inventory,
      fixture.freshBaseline,
    );
    expect(consumed?.learnerCarries.get('react/react-ch03-l01')?.sourceRecordDigest).toBe(
      fixture.bound.baseline.sourceRecordDigest,
    );
    expect(
      planRelease(fixture.bound.inventory, fixture.freshBaseline, movement).parent
        ?.sourceRecordDigest,
    ).toBe(fixture.freshBaseline.sourceRecordDigest);
    expect(fixture.inputs.declaration).toEqual(snapshot);
  });

  it('proof対を出さない従来入力はfresh時刻digestへ暗黙に付替えず旧strictを保つ', () => {
    expect(() =>
      verifyMovementInputs(fixture.bound.inputs, fixture.bound.inventory, fixture.bound.baseline),
    ).not.toThrow();
    expect(() =>
      verifyMovementInputs(fixture.bound.inputs, fixture.bound.inventory, fixture.freshBaseline),
    ).toThrow(/baseline/iu);
  });

  it('clean checkoutの固定元proofを読み、再captureした親へ元の承認scopeを接続する', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'movement-recorded-proof-'));
    try {
      const directory = path.join(root, 'docs/quality');
      await mkdir(directory, { recursive: true });
      const file = path.join(directory, 'movement-baseline-proof-v2.json');
      await writeFile(file, JSON.stringify(fixture.inputs.baselineProofs.original));
      const proofs = await readMovementBaselineProofs(
        root,
        fixture.bound.inputs.declaration.body.baseline,
        fixture.freshBaseline,
        fixture.inputs.baselineProofs.current,
      );
      expect(proofs).toEqual(fixture.inputs.baselineProofs);
      expect(() =>
        verifyMovementInputs(
          { ...fixture.bound.inputs, baselineProofs: proofs },
          fixture.bound.inventory,
          fixture.freshBaseline,
        ),
      ).not.toThrow();
      await writeFile(
        file,
        JSON.stringify({ ...fixture.inputs.baselineProofs.original, deploymentId: '502' }),
      );
      await expect(
        readMovementBaselineProofs(
          root,
          fixture.bound.inputs.declaration.body.baseline,
          fixture.freshBaseline,
          fixture.inputs.baselineProofs.current,
        ),
      ).rejects.toThrow(/proof|baseline/iu);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['original', 'current'] as const)('proof対の%s欠落を許可しない', (missing) => {
    const proofs = fixture.inputs.baselineProofs;
    const baselineProofs =
      missing === 'original' ? { current: proofs.current } : { original: proofs.original };
    expect(() =>
      verifyMovementInputs(
        { ...fixture.inputs, baselineProofs },
        fixture.bound.inventory,
        fixture.freshBaseline,
      ),
    ).toThrow(/proof|baseline/iu);
  });

  it.each(['original', 'current'] as const)(
    '%s proofの時刻だけを変えても拘束hash不一致なら拒否する',
    (side) => {
      const row = structuredClone(fixture);
      row.inputs.baselineProofs[side].observedAt = '2026-11-05T02:00:00.000Z';
      expect(() => verify(row)).toThrow(/proof|baseline/iu);
    },
  );

  it('fresh proofが一致してもfresh baseline自体のinventory改変を許可しない', () => {
    const row = structuredClone(fixture);
    row.freshBaseline.inventory.courses[0]!.revision += '-changed';
    expect(() => verify(row)).toThrow(/proof|baseline|inventory/iu);
  });

  // 各fresh proofをそのfresh baselineへ再hashし、単なる外側hash不一致に頼らない。
  it('observedAt以外の全proof fieldの変更・欠落を再hashで許可しない', () => {
    const changes = {
      schemaVersion: 2,
      repository: 'other/site',
      deploymentId: '502',
      sourceCommit: '7'.repeat(40),
      workflowHeadCommit: '7'.repeat(40),
      runId: '602',
      tag: 'refs/tags/tsumucode-release-other',
      tagDigest: 'e'.repeat(64),
      artifactDigest: 'e'.repeat(64),
      artifactDigestFormat: 'canonical-dist-v1',
      projection: 'public',
      inventoryDigest: 'changed-inventory',
      publicContentDigest: 'e'.repeat(64),
      publicFiles: 2,
    };
    for (const [field, replacement] of Object.entries(changes)) {
      const row = structuredClone(fixture);
      if (field === 'inventoryDigest')
        row.freshBaseline.inventory.courses[0]!.revision += '-changed';
      const current = {
        ...row.inputs.baselineProofs.current,
        [field]: field === 'inventoryDigest' ? hashValue(row.freshBaseline.inventory) : replacement,
      };
      const baseline = {
        ...row.freshBaseline,
        sourceRecordDigest: hashValue(current),
        deploymentId: current.deploymentId,
        sourceCommit: current.sourceCommit,
        artifactDigest: current.artifactDigest,
      };
      expect(
        () =>
          verifyMovementInputs(
            { ...row.inputs, baselineProofs: { ...row.inputs.baselineProofs, current } },
            row.bound.inventory,
            baseline,
          ),
        'changed ' + field,
      ).toThrow(/proof|baseline/iu);
      const missing = Object.fromEntries(
        Object.entries(current).filter(([name]) => name !== field),
      );
      expect(
        () =>
          verifyMovementInputs(
            { ...row.inputs, baselineProofs: { ...row.inputs.baselineProofs, current: missing } },
            row.bound.inventory,
            { ...baseline, sourceRecordDigest: hashValue(missing) },
          ),
        'missing ' + field,
      ).toThrow(/proof|baseline/iu);
    }
  });
});
