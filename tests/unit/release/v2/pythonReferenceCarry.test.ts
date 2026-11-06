// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import { readFile, cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ContentReceiptSchema, verifyContent } from '../../../../scripts/release/v2/content';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { planRelease } from '../../../../scripts/release/v2/plan';
import {
  capturePythonReferenceOriginals,
  verifyPythonReferenceOriginals,
} from '../../../../scripts/release/v2/pythonReferenceCarry';
import { readAuthoringAtSource } from '../../../../scripts/release/v2/sourceInventory';
import {
  verifyMovementInputs,
  consumeVerifiedMovement,
} from '../../../../scripts/release/v2/movement';
import { pythonReferenceFixture, sealPythonReferenceFixture } from './pythonReferenceFixture';

let fixture: Awaited<ReturnType<typeof pythonReferenceFixture>>;
beforeAll(async () => {
  fixture = sealPythonReferenceFixture(await pythonReferenceFixture());
}, 60000);

it('固定2教材の実Git参照差分を保全し、新roleの受入を作らない', () => {
  const verified = verifyMovementInputs(fixture.inputs, fixture.inventory, fixture.baseline);
  const carries = consumeVerifiedMovement(
    verified,
    fixture.inventory,
    fixture.baseline,
  )!.learnerCarries;
  for (const id of ['python-basics-ch01-l05', 'python-basics-ch02-l01'])
    expect(carries.get('python-basics/' + id)).toMatchObject({
      kind: 'reference-only',
      fromLessonId: id,
      toLessonId: id,
      sourceCommit: fixture.baseline.sourceCommit,
    });
});

it('eb2の固定組も実Gitの67原本と投影を照合し、別Sourceへは広げない', async () => {
  const sourceCommit = 'eb2fe6f8e06409569f173efb2fe6275c46a535cf';
  const original = await readAuthoringAtSource(process.cwd(), sourceCommit, 'python-basics', true);
  const originals = {
    previous: original.pythonReferenceOriginals,
    current: fixture.inputs.pythonReferenceOriginals.current,
  };
  // 認証は合成unit baseline。実配信・新role承認の証拠にはしない。
  const baseline = { ...fixture.baseline, sourceCommit, inventory: original.inventory };
  const verify = (input = baseline) =>
    verifyPythonReferenceOriginals(
      originals,
      fixture.inventory,
      input,
      '19cbed7d95cac527d17b58f3522cdf4f05466b92',
      fixture.inputs.declaration.declarationDigest,
    );
  expect(originals.previous).toEqual(fixture.inputs.pythonReferenceOriginals.previous);
  expect([...verify().values()]).toHaveLength(2);
  expect([...verify().values()].every((carry) => carry.sourceCommit === sourceCommit)).toBe(true);
  expect(() => verify({ ...baseline, sourceCommit: '9'.repeat(40) })).toThrow(
    /Fixed Python reference source differs/u,
  );
});

it.each([
  [
    '本文/目標',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[0]!.projection.goal = '別の目標';
    },
  ],
  [
    'raw fixture/採点bytes',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[0]!.files[0]!.sha256 = '0'.repeat(64);
    },
  ],
  [
    'raw旧原本',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.previous[1]!.files[0]!.bytes += 1;
    },
  ],
  [
    '原本両側を同時改変',
    (r: typeof fixture) => {
      for (const side of ['previous', 'current'] as const)
        r.inputs.pythonReferenceOriginals[side][0]!.files[0]!.sha256 = '0'.repeat(64);
    },
  ],
  [
    '違う前提',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[0]!.lessonSource =
        r.inputs.pythonReferenceOriginals.current[0]!.lessonSource.replace('l05-iterate', 'l04');
    },
  ],
  [
    '違う初出Slide',
    (r: typeof fixture) => {
      const p = r.inputs.pythonReferenceOriginals.current[0]!.projection;
      (p.glossary as { firstSlideId: string }[])[0]!.firstSlideId = 'python-basics-ch01-l04-s01';
    },
  ],
  [
    '参照先投影改変',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[0]!.targetProjection.goal = '別の目標';
    },
  ],
  [
    '参照先Slide欠落',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[1]!.targetProjection.slides = [];
    },
  ],
  [
    'next変更',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[0]!.nextLessonId = 'python-basics-ch01-l06';
    },
  ],
  [
    'Lesson欠落',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current.pop();
    },
  ],
  [
    'Lesson重複',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.previous[1] =
        r.inputs.pythonReferenceOriginals.previous[0]!;
    },
  ],
  [
    'extra Lesson',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current.push(r.inputs.pythonReferenceOriginals.current[0]!);
    },
  ],
  [
    'file欠落',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[0]!.files.pop();
    },
  ],
  [
    'file重複',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[0]!.files[1] =
        r.inputs.pythonReferenceOriginals.current[0]!.files[0]!;
    },
  ],
  [
    'extra file',
    (r: typeof fixture) => {
      r.inputs.pythonReferenceOriginals.current[0]!.files.push({
        path: 'extra.md',
        bytes: 0,
        sha256: '0'.repeat(64),
      });
    },
  ],
  [
    '旧Source変更',
    (r: typeof fixture) => {
      r.baseline.sourceCommit = '1'.repeat(40);
    },
  ],
  [
    '候補Source変更',
    (r: typeof fixture) => {
      r.inputs.declaration.body.candidateContentCommit = '2'.repeat(40);
    },
  ],
  [
    '採点契約変更',
    (r: typeof fixture) => {
      r.inventory.courses
        .find((c) => c.id === 'python-basics')!
        .lessons.find((l) => l.id === 'python-basics-ch01-l05')!.exerciseDigest = '0'.repeat(64);
    },
  ],
] as const)('%sを外側hashの再計算で隠しても拒否する', (_name, mutate) => {
  const row = structuredClone(fixture);
  mutate(row);
  sealPythonReferenceFixture(row);
  expect(() => verifyMovementInputs(row.inputs, row.inventory, row.baseline)).toThrow();
});

it('拘束した原本の後書き変更を再検証で拒否する', () => {
  const row = structuredClone(fixture);
  const verified = verifyMovementInputs(row.inputs, row.inventory, row.baseline);
  row.inputs.pythonReferenceOriginals.current[0]!.projection.goal = '別の目標';
  // verifierは入力をparseして保存するので、外側の変更で既検査snapshotは変わらない。
  expect(() => consumeVerifiedMovement(verified, row.inventory, row.baseline)).not.toThrow();
  expect(() => verifyMovementInputs(row.inputs, row.inventory, row.baseline)).toThrow(
    /original payload/iu,
  );
});

it('固定markerと原本を一方だけ出しても受け入れない', () => {
  const row = structuredClone(fixture);
  const { pythonReferenceOriginals, ...noPayload } = row.inputs;
  void pythonReferenceOriginals;
  expect(() => verifyMovementInputs(noPayload, row.inventory, row.baseline)).toThrow(
    /marker|original/iu,
  );
  const { pythonReferenceUpdates, ...noMarker } = row.inputs.declaration.body;
  void pythonReferenceUpdates;
  expect(() =>
    verifyMovementInputs(
      { ...row.inputs, declaration: { ...row.inputs.declaration, body: noMarker } },
      row.inventory,
      row.baseline,
    ),
  ).toThrow(/marker|original/iu);
});

it('新markerをjointやReact後続へ拡張しない', () => {
  for (const stage of ['joint', 'react-after-python']) {
    const row = structuredClone(fixture);
    expect(() =>
      verifyMovementInputs(
        {
          ...row.inputs,
          declaration: {
            ...row.inputs.declaration,
            body: { ...row.inputs.declaration.body, stage },
          },
        },
        row.inventory,
        row.baseline,
      ),
    ).toThrow();
  }
});

it('新rolesを要求せずnavigation/persistenceとfixture/project全件を維持する', async () => {
  const movement = verifyMovementInputs(fixture.inputs, fixture.inventory, fixture.baseline);
  const policy = z
    .object({ receipts: z.array(ContentReceiptSchema) })
    .parse(JSON.parse(await readFile('docs/quality/content-v2-receipts.json', 'utf8')));
  const content = verifyContent(
    fixture.inventory,
    policy.receipts,
    fixture.baseline,
    [],
    [],
    movement,
  );
  const plan = planRelease(fixture.inventory, fixture.baseline, movement);
  const fresh = planRelease(fixture.inventory);
  for (const id of ['python-basics-ch01-l05', 'python-basics-ch02-l01']) {
    const key = 'python-basics/' + id;
    expect(content.newlyApprovedLessons).not.toContain(key);
    expect(content.technicalRechecks).toContainEqual({
      lesson: key,
      scopes: ['navigation', 'persistence'],
    });
    expect(
      plan.targets.filter((t) => t.lessonId === id && ['content', 'learning'].includes(t.kind)),
    ).toEqual([]);
    expect(
      plan.targets
        .filter((t) => t.lessonId === id && t.kind === 'learning-engine')
        .map((t) => t.engine),
    ).toEqual(['chromium', 'firefox', 'webkit']);
    expect(
      consumeVerifiedMovement(movement, fixture.inventory, fixture.baseline)!.resolved.has(
        'python-basics/' + id + '/' + id + '-e01',
      ),
    ).toBe(false);
  }
  const technical = (t: { kind: string }) => ['fixture', 'project', 'persistence'].includes(t.kind);
  expect(plan.targets.filter(technical)).toEqual(fresh.targets.filter(technical));
  expect(
    consumeVerifiedMovement(movement, fixture.inventory, fixture.baseline)!.resolved.size,
  ).toBe(3);
});

it.each(['previous', 'current'] as const)(
  '%sのwithdrawalをreference carryで隠さない',
  async (side) => {
    const movement = verifyMovementInputs(fixture.inputs, fixture.inventory, fixture.baseline);
    const policy = z
      .object({ receipts: z.array(ContentReceiptSchema) })
      .parse(JSON.parse(await readFile('docs/quality/content-v2-receipts.json', 'utf8')));
    const original = fixture.inputs.pythonReferenceOriginals[side][0]!;
    const inventory = side === 'previous' ? fixture.baseline.inventory : fixture.inventory;
    const lesson = inventory.courses
      .find((c) => c.id === 'python-basics')!
      .lessons.find((l) => l.id === original.lessonId)!;
    expect(() =>
      verifyContent(
        fixture.inventory,
        policy.receipts,
        fixture.baseline,
        [
          {
            courseId: 'python-basics',
            lessonId: original.lessonId,
            learnerDigest: lesson.learnerDigest,
            sourceCommit:
              side === 'previous'
                ? fixture.baseline.sourceCommit
                : fixture.inputs.declaration.body.candidateContentCommit,
            reason: 'known-finding',
          },
        ],
        [],
        movement,
      ),
    ).toThrow(/withdrawal/iu);
  },
);

it('実FSの全67fileを採取し、symlinkと余分なfileを拒否する', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fixed-python-reference-'));
  try {
    for (const [chapter, id] of [
      ['python-basics-ch01', 'python-basics-ch01-l05'],
      ['python-basics-ch02', 'python-basics-ch02-l01'],
    ] as const)
      await cp(
        'content/python-basics/chapters/' + chapter + '/lessons/' + id,
        path.join(root, 'chapters', chapter, 'lessons', id),
        { recursive: true },
      );
    const original = await capturePythonReferenceOriginals(
      root,
      fixture.currentCompilation,
      'current',
    );
    expect(original).toEqual(fixture.inputs.pythonReferenceOriginals.current);
    const file = path.join(
      root,
      'chapters/python-basics-ch01/lessons/python-basics-ch01-l05/extra.md',
    );
    await symlink('lesson.yaml', file);
    await expect(
      capturePythonReferenceOriginals(root, fixture.currentCompilation, 'current'),
    ).rejects.toThrow(/regular/iu);
    await rm(file);
    await writeFile(file, 'extra');
    const row = structuredClone(fixture);
    row.inputs.pythonReferenceOriginals.current = await capturePythonReferenceOriginals(
      root,
      fixture.currentCompilation,
      'current',
    );
    sealPythonReferenceFixture(row);
    expect(() => verifyMovementInputs(row.inputs, row.inventory, row.baseline)).toThrow(
      /raw originals/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each(['kind', 'runtimeKind', 'persistenceDigest', 'both-sides-runtimeKind'] as const)(
  '投影外の%s改変でproject/engine/保存義務を変えられない',
  (field) => {
    const row = structuredClone(fixture);
    const subject = (source: typeof row.inventory) =>
      source.courses
        .find((c) => c.id === 'python-basics')!
        .lessons.find((l) => l.id === 'python-basics-ch02-l01')!;
    if (field === 'kind') subject(row.inventory).kind = 'standard';
    else if (field === 'persistenceDigest')
      subject(row.inventory).persistenceDigest = '0'.repeat(64);
    else {
      subject(row.inventory).exercises[0]!.runtimeKind = 'javascript';
      if (field === 'both-sides-runtimeKind')
        subject(row.baseline.inventory).exercises[0]!.runtimeKind = 'javascript';
    }
    sealPythonReferenceFixture(row);
    expect(() => verifyMovementInputs(row.inputs, row.inventory, row.baseline)).toThrow();
  },
);

it.each(['current', 'both'] as const)(
  '投影外の%s runtime契約を個別hash更新/集約据置で偽装できない',
  (side) => {
    const row = structuredClone(fixture);
    const change = (originals: typeof row.inputs.previous, inventory: typeof row.inventory) => {
      const full = originals
        .find((c) => c.courseId === 'python-basics')!
        .exercises.find((e) => e.id === 'python-basics-ch01-l05-e01')!;
      if (full.runtime?.kind !== 'python') throw Error('Expected actual Python source');
      full.runtime.profile = 'list-values-update-v1';
      const exercise = inventory.courses
        .find((c) => c.id === 'python-basics')!
        .lessons.find((l) => l.id === 'python-basics-ch01-l05')!.exercises[0]!;
      exercise.profile = 'list-values-update-v1';
      exercise.digest = hashValue(full);
    };
    change(row.inputs.current, row.inventory);
    if (side === 'both') change(row.inputs.previous, row.baseline.inventory);
    sealPythonReferenceFixture(row);
    expect(() => verifyMovementInputs(row.inputs, row.inventory, row.baseline)).toThrow();
  },
);
