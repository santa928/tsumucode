// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyMovementInputs } from '../../../../scripts/release/v2/movement';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { hashValue } from '../../../../scripts/release/v2/identity';
import {
  sealStageFixture,
  stagedMovementFixture,
  type StageFixture,
} from './stagedMovementFixture';

// 合成protocolの正負対。実baseline、公開成功、旧UI/新3役の観測を主張しない。
describe('固定joint / Python先行 / 認証Python後のReact段階だけのmovement', () => {
  let fixture: Awaited<ReturnType<typeof stagedMovementFixture>>;
  beforeAll(async () => {
    fixture = await stagedMovementFixture();
  }, 30000);
  const key = (row: { courseId: string; lessonId: string }) => row.courseId + '/' + row.lessonId;
  const verify = (row: StageFixture) =>
    verifyMovementInputs(row.inputs, row.inventory, row.baseline);

  function movedFixtureCount(row: {
    baseline: StageFixture['baseline'];
    inputs: {
      declaration: { body: { moves: StageFixture['inputs']['declaration']['body']['moves'] } };
    };
  }) {
    return row.inputs.declaration.body.moves.reduce(
      (total, move) =>
        total +
        row.baseline.inventory.courses
          .find((course) => course.id === move.courseId)!
          .lessons.find((lesson) => lesson.id === move.fromLessonId)!
          .exercises.reduce((sum, exercise) => sum + exercise.fixtures.length, 0),
      0,
    );
  }

  // Break: 固定stageを単なるcourse filterにし、旧28/10や他Courseの技術targetを落とす。
  it('Python先行は固定28移動と10個別承認を保ち、React旧契約を通常planへ残す', () => {
    const row = fixture.python;
    expect(movedFixtureCount(row)).toBe(28);
    expect(row.inputs.declaration.body.intents).toHaveLength(10);
    expect(row.inputs.declaration.approvals).toHaveLength(10);
    expect(row.inventory.courses.find((course) => course.id === 'react')).toEqual(
      row.baseline.inventory.courses.find((course) => course.id === 'react'),
    );
    expect(() => verify(row)).not.toThrow();
    const plan = planRelease(row.inventory, row.baseline, verify(row));
    const fresh = planRelease(row.inventory);
    expect(
      plan.targets.filter((target) => ['fixture', 'project', 'persistence'].includes(target.kind)),
    ).toEqual(
      fresh.targets.filter((target) => ['fixture', 'project', 'persistence'].includes(target.kind)),
    );
    for (const lesson of row.inputs.declaration.body.recheckLessons)
      expect(
        plan.targets
          .filter((target) => key(target) === lesson && target.kind === 'learning-engine')
          .map((target) => target.engine),
      ).toEqual(['chromium', 'firefox', 'webkit']);
    expect(
      plan.targets.filter(
        (target) =>
          target.courseId === 'react' &&
          ['content', 'learning', 'learning-engine'].includes(target.kind),
      ),
    ).toEqual([]);
    expect(
      plan.targets.filter(
        (target) =>
          key(target) === 'python-basics/python-basics-ch01-l13' &&
          ['content', 'learning'].includes(target.kind),
      ),
    ).toEqual([]);
    const moduleTargets = plan.targets.filter(
      (target) => key(target) === 'python-basics/python-basics-ch01-l12',
    );
    expect(moduleTargets.filter((target) => target.kind === 'content')).toHaveLength(1);
    expect(moduleTargets.filter((target) => target.kind === 'learning')).toEqual([]);
  });

  // 外側hash/承認scopeも全て更新し、未消費Courseを変更してよい宣言にはしない。
  it('Python先行に未消費Reactの学習表示変更を同居させない', () => {
    const row = structuredClone(fixture.python);
    row.inventory.courses.find((course) => course.id === 'react')!.lessons[0]!.learnerDigest =
      'e'.repeat(64);
    sealStageFixture(row);
    expect(() => verify(row)).toThrow(/Unconsumed movement course differs: react/u);
  });

  it('Python先行でも旧10意図の1件欠落を再hashで承認済みにしない', () => {
    const row = structuredClone(fixture.python);
    const removed = row.inputs.declaration.body.intents.pop()!;
    row.inputs.declaration.approvals = row.inputs.declaration.approvals.filter(
      (approval) => approval.oldFixtureId !== removed.oldFixtureId,
    );
    sealStageFixture(row);
    expect(() => verify(row)).toThrow(/intents|replacement intent|approvals/iu);
  });

  it('Python先行の固定2移動を同数の任意subsetへ差し替えない', () => {
    const row = structuredClone(fixture.python);
    row.inputs.declaration.body.moves[1] = structuredClone(
      fixture.joint.inputs.declaration.body.moves.find((move) => move.courseId === 'react')!,
    );
    sealStageFixture(row);
    expect(() => verify(row)).toThrow(/fixed.*stage|stage.*coverage/iu);
  });

  it('stage省略のjointは固定53移動と10承認を保ち従来の検証済み入力で通る', () => {
    const row = fixture.joint;
    expect(movedFixtureCount(row)).toBe(53);
    expect(row.inputs.declaration.body.intents).toHaveLength(10);
    expect(row.inputs.declaration.approvals).toHaveLength(10);
    expect(() => verifyMovementInputs(row.inputs, row.inventory, row.baseline)).not.toThrow();
  });

  // Break: 後続stageが10承認を自己申告で省略する、又は過去technical期限を現在へ更新する。
  it('React後続は固定25移動を消費し、AppRecordがhashで結ぶ前段28+10を一段だけ保持する', () => {
    const row = fixture.react;
    expect(movedFixtureCount(row)).toBe(25);
    expect(row.inputs.declaration.body.intents).toEqual([]);
    expect(row.inputs.declaration.approvals).toEqual([]);
    expect(row.history.bundle.snapshot.movementInputs.declaration.body.stage).toBe('python-first');
    expect(row.history.bundle.snapshot.movementInputs.declaration.body.intents).toHaveLength(10);
    expect(row.history.bundle.snapshot.movementInputs.declaration.approvals).toHaveLength(10);
    // 既に過去のtechnical期限。歴史的成功を新しい実行成功へ付け替える要求はしない。
    expect(row.history.qualification.technical.expiresAt).toBe('2026-11-04T14:00:00Z');
    expect(row.baseline.sourceRecordDigest).toBe(hashValue(row.history.proof));
    expect(() => verify(row)).not.toThrow();
    const plan = planRelease(row.inventory, row.baseline, verify(row));
    const fresh = planRelease(row.inventory);
    expect(
      plan.targets.filter((target) => ['fixture', 'project', 'persistence'].includes(target.kind)),
    ).toEqual(
      fresh.targets.filter((target) => ['fixture', 'project', 'persistence'].includes(target.kind)),
    );
    for (const lesson of row.inputs.declaration.body.recheckLessons)
      expect(
        plan.targets
          .filter((target) => key(target) === lesson && target.kind === 'learning-engine')
          .map((target) => target.engine),
      ).toEqual(['chromium', 'firefox', 'webkit']);
    expect(
      plan.targets.filter(
        (target) =>
          target.courseId === 'python-basics' &&
          ['content', 'learning', 'learning-engine'].includes(target.kind),
      ),
    ).toEqual([]);
    for (const lesson of ['react/react-ch03-l01', 'react/react-ch03-l02', 'react/react-ch04-l01'])
      expect(
        plan.targets.filter(
          (target) => key(target) === lesson && ['content', 'learning'].includes(target.kind),
        ),
      ).toEqual([]);
    expect(
      plan.targets.filter(
        (target) => key(target) === 'react/react-ch01-l01' && target.kind === 'content',
      ),
    ).toHaveLength(1);
    expect(
      plan.targets.filter(
        (target) => key(target) === 'react/react-ch01-l01' && target.kind === 'learning',
      ),
    ).toEqual([]);
  });

  it('React後続のapproved自己申告historyを実前段の代わりに受理しない', () => {
    const row = structuredClone(fixture.react);
    row.inputs.predecessor = { approved: true, movedFixtures: 28, replacementIntents: 10 };
    sealStageFixture(row);
    expect(() => verify(row)).toThrow(/predecessor|history/iu);
  });

  it('React後続のqualification原本hash不一致を外側宣言の再hashで隠さない', () => {
    const row = structuredClone(fixture.react);
    row.history.qualification.content.newlyApprovedLessons.push('python-basics/unreviewed-goal');
    // authenticated tag/AppRecordのqualificationDigestは変えず、新bodyだけを再拘束。
    sealStageFixture(row);
    expect(() => verify(row)).toThrow(
      /predecessor.*qualification|qualification.*(?:hash|digest)/iu,
    );
  });

  it('React後続の前段snapshotだけ別inventoryへ付け替えない', () => {
    const row = structuredClone(fixture.react);
    row.history.bundle.snapshot.inventory.courses.find(
      (course) => course.id === 'python-basics',
    )!.lessons[0]!.navigationDigest = 'e'.repeat(64);
    // 変更したsnapshotをAppRecord/current baselineと一致させたことにはしない。
    sealStageFixture(row);
    expect(() => verify(row)).toThrow(
      /predecessor.*inventory|inventory.*(?:hash|digest|differs)/iu,
    );
  });
});
