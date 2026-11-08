// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyMovementInputs } from '../../../../scripts/release/v2/movement';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { verifyContent, type ContentReceipt } from '../../../../scripts/release/v2/content';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { learnerMovementOriginals } from '../../../../scripts/release/v2/learnerMovement';
import { PURE_MOVES } from '../../../../scripts/release/v2/movement';
import { learnerCarryFixture, replaceAt, sealLearnerFixture } from './learnerCarryFixture';

// 合成baseline/承認。実際の歴史的UI観測、新3役の実績、公開承認にはしない。
const exact = [
  'python-basics/python-basics-ch01-l13',
  'react/react-ch03-l01',
  'react/react-ch03-l02',
  'react/react-ch04-l01',
];
const explained = ['python-basics/python-basics-ch01-l12', 'react/react-ch01-l01'];
const key = (row: { courseId: string; lessonId: string }) => row.courseId + '/' + row.lessonId;

describe('代表改訂の固定4移動と2説明差分だけのlearner carry', () => {
  let fixture: Awaited<ReturnType<typeof learnerCarryFixture>>;
  beforeAll(async () => {
    fixture = sealLearnerFixture(await learnerCarryFixture());
  }, 30000);

  function verify(row = fixture) {
    return verifyMovementInputs(row.inputs, row.inventory, row.baseline);
  }

  function receipts() {
    return fixture.inventory.courses.flatMap((course) =>
      course.lessons.flatMap((lesson) =>
        (['content', 'novice', 'recovery', 'maker'] as const).map((role): ContentReceipt => ({
          schemaVersion: 1,
          courseId: course.id,
          lessonId: lesson.id,
          learnerDigest: lesson.learnerDigest,
          sourceCommit: fixture.inputs.declaration.body.candidateContentCommit,
          authorId: 'synthetic-author',
          actorId: 'synthetic-' + role,
          role,
          method: role === 'content' ? 'source-review' : 'agent-ui',
          status: 'approved',
          accuracy: 'approved',
          goalExerciseAlignment: 'approved',
          unexplainedTerms: 0,
          hintLeakage: 0,
          examplesExecuted: true,
          session: 'synthetic-session-' + role,
          context: 'synthetic-context-' + role,
          originalDigest: hashValue('synthetic-original-' + role),
          receiptDigest: hashValue('synthetic-receipt-' + role),
          originalsCheckedBy: 'synthetic-inspector',
        })),
      ),
    );
  }

  function requiredReceipts() {
    return receipts().filter(
      (row) =>
        !exact.includes(key(row)) && (!explained.includes(key(row)) || row.role === 'content'),
    );
  }

  it('独立に残した現projectionが同Compileのinventory learnerDigestを再現する', () => {
    expect(learnerMovementOriginals(fixture.compilations, PURE_MOVES, 'current')).toEqual(
      fixture.inputs.learnerOriginals.current,
    );
    for (const original of fixture.inputs.learnerOriginals.current) {
      const lesson = fixture.inventory.courses
        .find((course) => course.id === original.courseId)!
        .lessons.find((lesson) => lesson.id === original.lessonId)!;
      expect(hashValue(original.projection)).toBe(lesson.learnerDigest);
    }
  });

  // Break: 全移動先を新4役へ戻す、またはrechecksごと消してengineまで削る。
  it('写像先の4件だけ新4役を減らし、2説明差分には現contentを残し、engine全件を残す', () => {
    expect(() => verify()).not.toThrow();
    const plan = planRelease(fixture.inventory, fixture.baseline, verify());
    for (const lesson of exact)
      expect(
        plan.targets.filter(
          (row) => key(row) === lesson && ['content', 'learning'].includes(row.kind),
        ),
      ).toEqual([]);
    for (const lesson of explained) {
      const targets = plan.targets.filter((row) => key(row) === lesson);
      expect(targets.filter((row) => row.kind === 'content')).toHaveLength(1);
      expect(targets.filter((row) => row.kind === 'learning')).toEqual([]);
    }
    for (const lesson of fixture.inputs.declaration.body.recheckLessons)
      expect(
        plan.targets
          .filter((row) => key(row) === lesson && row.kind === 'learning-engine')
          .map((row) => row.engine),
      ).toEqual(['chromium', 'firefox', 'webkit']);
    for (const lesson of ['python-basics/python-basics-ch01-l08', 'react/react-ch02-l01']) {
      const targets = plan.targets.filter((row) => key(row) === lesson);
      expect(targets.filter((row) => row.kind === 'content')).toHaveLength(1);
      expect(targets.filter((row) => row.kind === 'learning').map((row) => row.role)).toEqual([
        'novice',
        'recovery',
        'maker',
      ]);
    }
    const fresh = planRelease(fixture.inventory);
    expect(
      plan.targets.filter((row) => ['fixture', 'project', 'persistence'].includes(row.kind)),
    ).toEqual(
      fresh.targets.filter((row) => ['fixture', 'project', 'persistence'].includes(row.kind)),
    );
  });

  // Break: 旧3役の観測を新receiptへ付け替える、同IDの旧Capstoneへ誤接続する。
  it('旧Sourceと旧Lessonを残した別proofで受け入れ、新3役を生成しない', () => {
    const acceptance = verifyContent(
      fixture.inventory,
      requiredReceipts(),
      fixture.baseline,
      [],
      [],
      verify(),
    );
    expect(acceptance.newlyApprovedLessons).not.toContain('react/react-ch03-l01');
    expect(acceptance).toHaveProperty(
      'movementLearnerAcceptance',
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'identical-move',
          courseId: 'react',
          fromLessonId: 'react-ch02-l01',
          toLessonId: 'react-ch03-l01',
          sourceCommit: fixture.baseline.sourceCommit,
          sourceRecordDigest: fixture.baseline.sourceRecordDigest,
          candidateContentCommit: fixture.inputs.declaration.body.candidateContentCommit,
        }),
        expect.objectContaining({
          kind: 'content-delta',
          courseId: 'react',
          fromLessonId: 'react-ch01-l01',
          toLessonId: 'react-ch01-l01',
        }),
      ]),
    );
  });

  // Break: 許された説明差分が新contentレビューまで免除する。
  it.each(explained)('説明差分の現Source content原本を必須にする: %s', (lesson) => {
    const missing = requiredReceipts().filter((row) => key(row) !== lesson);
    expect(() =>
      verifyContent(fixture.inventory, missing, fixture.baseline, [], [], verify()),
    ).toThrow(/content.*receipt|receipt.*content/iu);
    const stale = requiredReceipts().map((row) =>
      key(row) === lesson ? { ...row, sourceCommit: fixture.baseline.sourceCommit } : row,
    );
    expect(() =>
      verifyContent(fixture.inventory, stale, fixture.baseline, [], [], verify()),
    ).toThrow(/candidate-source|source.*differs/iu);
  });

  it.each(['approval-withdrawn', 'known-finding'] as const)(
    '旧側と現側の%sをcarryで隠さない',
    (reason) => {
      for (const side of ['previous', 'current'] as const) {
        const original = fixture.inputs.learnerOriginals[side].find(
          (row) =>
            row.courseId === 'react' &&
            row.lessonId === (side === 'previous' ? 'react-ch02-l01' : 'react-ch03-l01'),
        )!;
        expect(() =>
          verifyContent(
            fixture.inventory,
            requiredReceipts(),
            fixture.baseline,
            [
              {
                courseId: original.courseId,
                lessonId: original.lessonId,
                learnerDigest: hashValue(original.projection),
                reason,
                sourceCommit:
                  side === 'previous'
                    ? fixture.baseline.sourceCommit
                    : fixture.inputs.declaration.body.candidateContentCommit,
              },
            ],
            [],
            verify(),
          ),
        ).toThrow(/withdrawal|finding/iu);
      }
    },
  );

  // Break: 外側digestを再計算すれば未写像原本と認証inventoryの不一致を通せる。
  it.each(['previous', 'current'] as const)(
    '未写像projectionのinventory hash一致が必須: %s',
    (side) => {
      const changed = structuredClone(fixture);
      changed.inputs.learnerOriginals[side][1]!.projection.title += ' altered';
      sealLearnerFixture(changed);
      expect(() => verify(changed)).toThrow(
        /learner.*(?:digest|hash)|projection.*(?:digest|hash)/iu,
      );
    },
  );

  it.each(['missing', 'duplicate', 'extra-lesson'])(
    '固定原本の欠落・重複・対象外を拒否する: %s',
    (failure) => {
      const changed = structuredClone(fixture);
      const rows = changed.inputs.learnerOriginals.current;
      if (failure === 'missing') rows.pop();
      if (failure === 'duplicate') rows[0] = structuredClone(rows[1]!);
      if (failure === 'extra-lesson')
        rows.push({ ...structuredClone(rows[0]!), lessonId: 'unapproved-lesson' });
      sealLearnerFixture(changed);
      expect(() => verify(changed)).toThrow(/learner|projection|coverage|duplicate/iu);
    },
  );

  it('本文中の旧ID文字列は同一のまま保持し、写像後の文字列への書換えを拒否する', () => {
    const changed = structuredClone(fixture);
    const previous = changed.inputs.learnerOriginals.previous.find(
      (row) => row.courseId === 'react' && row.lessonId === 'react-ch02-l01',
    )!;
    const current = changed.inputs.learnerOriginals.current.find(
      (row) => row.courseId === 'react' && row.lessonId === 'react-ch03-l01',
    )!;
    const path = ['exercises', 0, 'instructions', 1, 'text'];
    for (const row of [previous, current])
      replaceAt(row.projection, path, '本文内の参照文字列: react-ch02-l01-e01');
    function refresh() {
      for (const [inventory, row] of [
        [changed.baseline.inventory, previous],
        [changed.inventory, current],
      ] as const)
        inventory.courses
          .find((course) => course.id === row.courseId)!
          .lessons.find((lesson) => lesson.id === row.lessonId)!.learnerDigest = hashValue(
          row.projection,
        );
      sealLearnerFixture(changed);
    }
    refresh();
    expect(() => verify(changed)).not.toThrow();
    replaceAt(current.projection, path, '本文内の参照文字列: react-ch03-l01-e01');
    refresh();
    expect(() => verify(changed)).toThrow(/learner|projection|visible|delta/iu);
  });

  it.each(['runtime', 'fixture'] as const)(
    'React初回の表示外%s変化を固定copy差分へ同居させない',
    (failure) => {
      const changed = structuredClone(fixture);
      const currentCourse = changed.inputs.current.find((row) => row.courseId === 'react')!;
      const exerciseIndex = currentCourse.exercises.findIndex(
        (row) => row.id === 'react-ch01-l01-e01',
      );
      const full = currentCourse.exercises[exerciseIndex]!;
      const lesson = changed.inventory.courses
        .find((row) => row.id === 'react')!
        .lessons.find((row) => row.id === 'react-ch01-l01')!;
      const exercise = lesson.exercises[0]!;
      if (failure === 'runtime') {
        delete full.runtime;
        exercise.profile = 'default';
        exercise.capability = 'html-css';
      } else {
        const original = full.fixtures[0]!;
        const replacement: typeof original = {
          ...original,
          expectedStatus: original.expectedStatus === 'pass' ? 'incomplete' : 'pass',
        };
        currentCourse.exercises[exerciseIndex] = {
          ...full,
          fixtures: [replacement, ...full.fixtures.slice(1)],
        };
        const fixture = exercise.fixtures.find((row) => row.id === replacement.id)!;
        fixture.expectedStatus = replacement.expectedStatus;
        fixture.digest = hashValue(replacement);
      }
      exercise.digest = hashValue(currentCourse.exercises[exerciseIndex]);
      lesson.exerciseDigest = hashValue(lesson.exercises);
      sealLearnerFixture(changed);
      expect(() => verify(changed)).toThrow(/learner|contract|delta/iu);
    },
  );

  // Break: IDの文字列replace、asset byte/alt/本文の脱落、任意pointerの免除。
  it.each([
    'title',
    'body-id-string',
    'file-path',
    'file-content',
    'expected-text',
    'image-bytes',
    'image-alt',
    'glossary',
    'required',
    'hint',
    'feedback',
    'brief',
    'guide',
    'checklist',
    'extra-module-text',
    'extra-react-step',
  ])('再hashした追加表示変更もcopy-onlyとは扱わない: %s', (failure) => {
    const changed = structuredClone(fixture);
    const rows = changed.inputs.learnerOriginals.current;
    const row = rows.find(
      (row) =>
        row.lessonId ===
        (failure.startsWith('extra-module')
          ? 'python-basics-ch01-l12'
          : failure.startsWith('extra-react')
            ? 'react-ch01-l01'
            : ['brief', 'guide', 'checklist'].includes(failure)
              ? 'react-ch03-l01'
              : 'python-basics-ch01-l13'),
    )!;
    const projection = row.projection;
    switch (failure) {
      case 'title':
        projection.title += ' changed';
        break;
      case 'body-id-string':
        replaceAt(projection, ['exercises', 0, 'instructions', 1, 'text'], 'react-ch03-l01-e01');
        break;
      case 'file-path':
        replaceAt(projection, ['exercises', 0, 'files', 0, 'path'], 'renamed.py');
        break;
      case 'file-content':
        replaceAt(projection, ['exercises', 0, 'files', 0, 'content'], 'print("changed")');
        break;
      case 'expected-text':
        replaceAt(projection, ['exercises', 0, 'steps', 0, 'observe'], 'changed');
        break;
      case 'image-bytes':
        projection.assetSha256s[0]!.sha256 = 'a'.repeat(64);
        break;
      case 'image-alt': {
        const asset =
          projection.slides.flatMap((slide) => slide.assets)[0] ??
          projection.exercises.flatMap((exercise) => exercise.assets)[0];
        if (!asset || asset.alt === undefined) throw Error('Expected visible image alt in fixture');
        asset.alt += ' changed';
        break;
      }
      case 'glossary':
        replaceAt(projection, ['glossary'], [{ id: 'altered-term', term: 'changed' }]);
        break;
      case 'required':
        replaceAt(projection, ['exercises', 0, 'requiredForCompletion'], false);
        break;
      case 'hint':
        replaceAt(projection, ['exercises', 0, 'hints', 0, 'title'], 'changed');
        break;
      case 'feedback':
        replaceAt(
          projection,
          ['exercises', 0, 'validationFeedback', 0, 'feedback', 'expected'],
          'changed',
        );
        break;
      case 'brief':
      case 'guide':
        replaceAt(projection, ['project', failure], []);
        break;
      case 'checklist':
        replaceAt(projection, ['project', 'checklist', 0, 'required'], false);
        break;
      case 'extra-module-text':
        replaceAt(
          projection,
          ['exercises', 0, 'instructions', 1, 'text'],
          '別の新しい目標を追加します。',
        );
        break;
      case 'extra-react-step':
        replaceAt(projection, ['exercises', 0, 'steps', 0, 'target'], 'new task');
        break;
    }
    const lesson = changed.inventory.courses
      .find((course) => course.id === row.courseId)!
      .lessons.find((lesson) => lesson.id === row.lessonId)!;
    lesson.learnerDigest = hashValue(projection);
    sealLearnerFixture(changed);
    expect(() => verify(changed)).toThrow(/learner|projection|visible|delta/iu);
  });
});
