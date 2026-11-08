// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCourse, type AuthoringExercise } from '../../../../scripts/content/compileCourse';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { releaseFixture } from './releaseFixture';
import { movementFixture } from './movementFixture';
import {
  MovementDeclarationSchema,
  MovementInputsSchema,
  movementIntentScope,
  movementOriginals,
  verifyMovementInputs,
} from '../../../../scripts/release/v2/movement';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { verifyContent } from '../../../../scripts/release/v2/content';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { validateExecutionBundle } from '../../../../scripts/release/v2/runner';
import { qualifyRelease } from '../../../../scripts/release/v2/admission';

// 合成protocol入力だけを使い、実公開baselineや移動承認として扱わない。
const oldId = 'react-ch02-l01-e01';
const newId = 'react-ch03-l01-e01';
const laterId = 'react-ch04-l01-e01';
const references = { [oldId]: newId, [newId]: laterId };
let sample: AuthoringExercise;
beforeAll(async () => {
  const compilation = await compileCourse('content/python-basics');
  const exercise = compilation.authoringExercises?.find(
    (row) => row.id === 'python-basics-ch01-l12-e01',
  );
  if (!exercise) throw Error('Expected real compiler authoring metadata');
  sample = exercise;
}, 30000);

function pair() {
  const original = structuredClone(sample);
  return {
    original: { ...original, id: oldId },
    current: { ...structuredClone(original), id: newId },
  };
}

async function comparator() {
  // 初回REDではAPI未実装を観測済み。各保全境界の意味検査を同じAPIへ接続する。
  return (await import('../../../../scripts/release/v2/movement')).compareMovementExercise;
}

describe('今回の移動に限定した原本保全', () => {
  it('不変の旧参照からReact連鎖を同時写像する', async () => {
    const compare = await comparator();
    const { original, current } = pair();
    const snapshot = structuredClone(original);
    expect(() => {
      compare(original, current, references);
    }).not.toThrow();
    expect(original).toEqual(snapshot);
    expect(current.id).toBe(newId);
    expect(() => {
      compare(original, { ...current, id: laterId }, references);
    }).toThrow();
  });

  it('本文中のIDと同じ文字列を正規化しない', async () => {
    const compare = await comparator();
    const { original, current } = pair();
    const file = { ...original.files[0]!, content: `print("${oldId}")` };
    const old = { ...original, files: [file, ...original.files.slice(1)] };
    const exact = { ...current, files: structuredClone(old.files) };
    expect(() => {
      compare(old, exact, references);
    }).not.toThrow();
    const changed = {
      ...exact,
      files: [{ ...file, content: `print("${newId}")` }, ...exact.files.slice(1)],
    };
    expect(() => {
      compare(old, changed, references);
    }).toThrow();
  });

  it.each([
    'file-path',
    'fixture-file',
    'input-lines',
    'fault-injection',
    'local-status',
    'status',
    'diagnostic',
    'feedback',
    'runtime-profile',
    'capability',
    'solution-file',
    'starter-file',
    'unknown-field',
  ])('実行・採点fieldの変更を拒否する: %s', async (field) => {
    const compare = await comparator();
    const { original, current } = pair();
    const fixture = current.fixtures[0]!;
    let changed: unknown = current;
    switch (field) {
      case 'file-path':
        changed = { ...current, files: [{ ...current.files[0]!, path: 'renamed.py' }] };
        break;
      case 'fixture-file':
        changed = {
          ...current,
          fixtures: [
            { ...fixture, files: [{ ...current.files[0]!, content: 'print("changed")' }] },
            ...current.fixtures.slice(1),
          ],
        };
        break;
      case 'input-lines':
        changed = {
          ...current,
          fixtures: [{ ...fixture, inputLines: ['changed'] }, ...current.fixtures.slice(1)],
        };
        break;
      case 'fault-injection':
        changed = {
          ...current,
          fixtures: [
            { ...fixture, faultInjection: 'stale-source-evidence' },
            ...current.fixtures.slice(1),
          ],
        };
        break;
      case 'local-status':
        changed = {
          ...current,
          fixtures: [
            {
              ...fixture,
              expectedLocalStatus: fixture.expectedLocalStatus === 'pass' ? 'incomplete' : 'pass',
            },
            ...current.fixtures.slice(1),
          ],
        };
        break;
      case 'status':
        changed = {
          ...current,
          fixtures: [
            {
              ...fixture,
              expectedStatus: fixture.expectedStatus === 'pass' ? 'incomplete' : 'pass',
            },
            ...current.fixtures.slice(1),
          ],
        };
        break;
      case 'diagnostic':
        changed = {
          ...current,
          fixtures: [
            { ...fixture, expectedDiagnosticCodes: ['changed'] },
            ...current.fixtures.slice(1),
          ],
        };
        break;
      case 'feedback':
        changed = {
          ...current,
          fixtures: [
            { ...fixture, expectedFeedbackRuleIds: ['changed'] },
            ...current.fixtures.slice(1),
          ],
        };
        break;
      case 'runtime-profile':
        changed = { ...current, runtime: { ...current.runtime, profile: 'changed' } };
        break;
      case 'capability':
        changed = { ...current, runtime: { ...current.runtime, capabilityProfile: 'changed' } };
        break;
      case 'solution-file':
        changed = {
          ...current,
          solutionFiles: [{ ...current.solutionFiles[0]!, content: 'print("changed")' }],
        };
        break;
      case 'starter-file':
        changed = { ...current, files: [{ ...current.files[0]!, content: 'print("changed")' }] };
        break;
      case 'unknown-field':
        changed = { ...current, unclassifiedContract: true };
        break;
    }
    expect(() => {
      compare(original, changed, references);
    }).toThrow();
  });

  it('inventoryが同一でもplan境界の承認自己申告を拒否する', () => {
    const { snapshot, capturedBaseline } = releaseFixture();
    expect(() =>
      Reflect.apply(planRelease, undefined, [
        snapshot.inventory,
        capturedBaseline.baseline,
        { approved: true, consumedExerciseIds: ['anything'] },
      ]),
    ).toThrow();
    expect(planRelease(snapshot.inventory, capturedBaseline.baseline)).toEqual(snapshot.plan);
  });
});

describe('移動宣言と既存gateの拘束', () => {
  let fixture: Awaited<ReturnType<typeof movementFixture>>;
  beforeAll(async () => {
    fixture = await movementFixture();
  }, 30000);

  // 合成改変のhashも更新し、外側hashの古さだけを拒否理由にしない。
  function seal(input: typeof fixture.inputs) {
    const { declaration } = input;
    declaration.body.originalsDigest = hashValue({
      previous: input.previous,
      current: input.current,
    });
    declaration.bodyDigest = hashValue(declaration.body);
    for (const approval of declaration.approvals) {
      approval.bodyDigest = declaration.bodyDigest;
      approval.scopeDigest = movementIntentScope(declaration.body, approval.oldFixtureId);
      const { receiptDigest, ...unsigned } = approval;
      void receiptDigest;
      approval.receiptDigest = hashValue(unsigned);
    }
    const { declarationDigest, ...unsigned } = declaration;
    void declarationDigest;
    declaration.declarationDigest = hashValue(unsigned);
    return input;
  }

  it('全現fixtureのPython両modeと全persistence/project義務を維持する', () => {
    const movement = verifyMovementInputs(fixture.inputs, fixture.inventory, fixture.baseline);
    const plan = planRelease(fixture.inventory, fixture.baseline, movement);
    const fresh = planRelease(fixture.inventory);
    expect(
      plan.targets.filter((row) => ['fixture', 'persistence', 'project'].includes(row.kind)),
    ).toEqual(
      fresh.targets.filter((row) => ['fixture', 'persistence', 'project'].includes(row.kind)),
    );
    expect(plan).toHaveProperty(
      'movementDeclarationDigest',
      fixture.inputs.declaration.declarationDigest,
    );
    // authoredの同名IDとbuilt-inのsolution/starterを区別する。
    const solution = plan.targets.filter(
      (row) => row.exerciseId === 'python-basics-ch01-l11-e01' && row.fixtureId === 'solution',
    );
    expect(solution.map((row) => [row.caseKind, row.mode])).toEqual([
      ['solution', 'pyodide'],
      ['authored', 'pyodide'],
      ['solution', 'cpython'],
      ['authored', 'cpython'],
    ]);
  });

  it('同IDのReact ch03-l01を含む全新目標に新しい7対象を要求する', () => {
    const movement = verifyMovementInputs(fixture.inputs, fixture.inventory, fixture.baseline);
    const plan = planRelease(fixture.inventory, fixture.baseline, movement);
    expect(
      fixture.baseline.inventory.courses
        .find((row) => row.id === 'react')!
        .lessons.some((row) => row.id === 'react-ch03-l01'),
    ).toBe(true);
    for (const key of fixture.inputs.declaration.body.recheckLessons) {
      const targets = plan.targets.filter((row) => row.courseId + '/' + row.lessonId === key);
      expect(
        targets.filter((row) => row.kind === 'learning-engine').map((row) => row.engine),
      ).toEqual(['chromium', 'firefox', 'webkit']);
      expect(targets.filter((row) => row.kind === 'content')).toHaveLength(1);
      expect(targets.filter((row) => row.kind === 'learning').map((row) => row.role)).toEqual([
        'novice',
        'recovery',
        'maker',
      ]);
    }
  });

  it('同digestの旧carryと旧原本receiptの付け替えを拒否する', () => {
    const baseline = structuredClone(fixture.baseline);
    const current = fixture.inventory.courses
      .find((row) => row.id === 'react')!
      .lessons.find((row) => row.id === 'react-ch03-l01')!;
    baseline.inventory.courses
      .find((row) => row.id === 'react')!
      .lessons.find((row) => row.id === current.id)!.learnerDigest = current.learnerDigest;
    const inputs = structuredClone(fixture.inputs);
    inputs.declaration.body.baseline.inventoryDigest = hashValue(baseline.inventory);
    const movement = verifyMovementInputs(seal(inputs), fixture.inventory, baseline);
    expect(() => verifyContent(fixture.inventory, [], baseline, [], [], movement)).toThrow(
      /Missing .* receipt/u,
    );
    const receipt = {
      schemaVersion: 1,
      courseId: 'react',
      lessonId: current.id,
      learnerDigest: current.learnerDigest,
      sourceCommit: baseline.sourceCommit,
      authorId: 'author',
      actorId: 'reviewer',
      role: 'content',
      method: 'source-review',
      status: 'approved',
      accuracy: 'approved',
      goalExerciseAlignment: 'approved',
      unexplainedTerms: 0,
      hintLeakage: 0,
      examplesExecuted: true,
      session: 'old-session',
      context: 'old-context',
      originalDigest: 'a'.repeat(64),
      receiptDigest: 'b'.repeat(64),
      originalsCheckedBy: 'inspector',
    };
    expect(() => verifyContent(fixture.inventory, [receipt], baseline, [], [], movement)).toThrow(
      /fresh candidate-source receipt/u,
    );
  });

  it.each(['solution', 'direct-return', 'commuted-and-renamed', 'stored-results'] as const)(
    '旧positiveをnon-pass witnessだけへ付け替えた再承認済み宣言を拒否する: %s',
    (oldFixtureId) => {
      const input = structuredClone(fixture.inputs);
      const intent = input.declaration.body.intents.find(
        (row) => row.oldFixtureId === oldFixtureId,
      )!;
      const exercise = fixture.inventory.courses
        .find((course) => course.id === 'python-basics')!
        .lessons.find((lesson) => lesson.id === 'python-basics-ch01-l11')!
        .exercises.find((row) => row.id === 'python-basics-ch01-l11-e01')!;
      const negative = exercise.fixtures.find((row) => row.id === 'misconception')!;
      expect(intent.oldExpectedStatus).toBe('pass');
      expect(negative.expectedStatus).toBe('incomplete');
      expect(negative.expectedLocalStatus).toBe('incomplete');
      intent.witnesses = [
        {
          courseId: 'python-basics',
          lessonId: 'python-basics-ch01-l11',
          exerciseId: exercise.id,
          caseKind: 'authored',
          fixtureId: negative.id,
          fixtureDigest: negative.digest,
          modes: [
            {
              mode: 'pyodide',
              sourceDigest: negative.sourceDigest,
              expectedStatus: negative.expectedStatus,
            },
            {
              mode: 'cpython',
              sourceDigest: negative.nativeSourceDigest!,
              expectedStatus: negative.expectedLocalStatus!,
            },
          ],
        },
      ];
      // 現原本・入力・期待は変更せず、合成宣言の承認scopeと包絡をすべて再拘束する。
      seal(input);
      expect(input.declaration.bodyDigest).not.toBe(fixture.inputs.declaration.bodyDigest);
      expect(() => verifyMovementInputs(input, fixture.inventory, fixture.baseline)).toThrow(
        /positive|pass.*witness|witness.*pass/iu,
      );
    },
  );

  it.each([
    'baseline',
    'candidate',
    'original',
    'move-duplicate',
    'reference-extra',
    'intent-missing',
    'approval-missing',
    'approval-scope',
    'approval-independence',
    'witness-stale',
    'witness-built-in',
    'local-expectation',
    'new-goal-missing',
  ])('拘束された宣言の改変を拒否する: %s', (failure) => {
    const input = structuredClone(fixture.inputs);
    switch (failure) {
      case 'baseline':
        input.declaration.body.baseline.sourceRecordDigest = '0'.repeat(64);
        break;
      case 'candidate':
        input.declaration.body.candidateInventoryDigest = '0'.repeat(64);
        break;
      case 'original':
        input.current[0]!.exercises[0] = { ...input.current[0]!.exercises[0]!, solutionFiles: [] };
        break;
      case 'move-duplicate':
        input.declaration.body.moves[0] = input.declaration.body.moves[1]!;
        break;
      case 'reference-extra':
        input.declaration.body.references['unknown-reference'] = 'other-reference';
        break;
      case 'intent-missing':
        input.declaration.body.intents.pop();
        break;
      case 'approval-missing':
        input.declaration.approvals.pop();
        break;
      case 'approval-independence':
        input.declaration.approvals[0]!.reviewerId = input.declaration.approvals[0]!.authorId;
        break;
      case 'witness-stale':
        input.declaration.body.intents[0]!.witnesses[0]!.fixtureDigest = '0'.repeat(64);
        break;
      case 'witness-built-in':
        Reflect.set(input.declaration.body.intents[0]!.witnesses[0]!, 'caseKind', 'solution');
        break;
      case 'local-expectation':
        input.declaration.body.intents[0]!.witnesses[0]!.modes[1]!.expectedStatus = 'incomplete';
        break;
      case 'new-goal-missing':
        input.declaration.body.recheckLessons = input.declaration.body.recheckLessons.filter(
          (key) => key !== 'react/react-ch03-l01',
        );
        break;
    }
    // intent欠落時は対応する独立承認scopeも無いため再hashしない。
    if (failure === 'intent-missing') {
      expect(() => verifyMovementInputs(input, fixture.inventory, fixture.baseline)).toThrow();
    } else {
      seal(input);
      if (failure === 'approval-scope') {
        const approval = input.declaration.approvals[0]!;
        approval.scopeDigest = '0'.repeat(64);
        const { receiptDigest, ...unsignedApproval } = approval;
        void receiptDigest;
        approval.receiptDigest = hashValue(unsignedApproval);
        const { declarationDigest, ...unsignedDeclaration } = input.declaration;
        void declarationDigest;
        input.declaration.declarationDigest = hashValue(unsignedDeclaration);
      }
      expect(() => verifyMovementInputs(input, fixture.inventory, fixture.baseline)).toThrow();
    }
  });

  it('共用authored witnessにも旧intentごとの独立scope承認を要求する', () => {
    const intents = fixture.inputs.declaration.body.intents;
    expect(intents.find((row) => row.oldFixtureId === 'commuted-and-renamed')!.witnesses).toEqual(
      intents.find((row) => row.oldFixtureId === 'stored-results')!.witnesses,
    );
    expect(() =>
      verifyMovementInputs(fixture.inputs, fixture.inventory, fixture.baseline),
    ).not.toThrow();
    const input = structuredClone(fixture.inputs);
    const approval = input.declaration.approvals.find(
      (row) => row.oldFixtureId === 'commuted-and-renamed',
    )!;
    input.declaration.approvals[
      input.declaration.approvals.findIndex((row) => row.oldFixtureId === 'stored-results')
    ] = approval;
    const { declarationDigest, ...unsigned } = input.declaration;
    void declarationDigest;
    input.declaration.declarationDigest = hashValue(unsigned);
    expect(() => verifyMovementInputs(input, fixture.inventory, fixture.baseline)).toThrow(
      /Duplicate|approval/u,
    );
  });

  it('未知fieldと未拘束の草案を拒否する', () => {
    expect(() =>
      MovementDeclarationSchema.parse({ ...fixture.inputs.declaration, approved: true }),
    ).toThrow();
    expect(() =>
      MovementDeclarationSchema.parse({
        status: 'draft-unbound-not-executable',
        authenticatedBaselineBinding: null,
        declarationDigest: null,
      }),
    ).toThrow();
  });

  it('退役profileの歴史的認識を現payloadと現Compile原本の許可へ広げない', () => {
    const input = structuredClone(fixture.inputs);
    const previous = input.previous
      .find((course) => course.courseId === 'python-basics')!
      .exercises.find((exercise) => exercise.id === 'python-basics-ch01-l07-e01')!;
    Reflect.set(previous.runtime!, 'profile', 'function-return-scope-v1');
    expect(
      MovementInputsSchema.parse(input)
        .previous.find((course) => course.courseId === 'python-basics')!
        .exercises.find((exercise) => exercise.id === previous.id)!.runtime,
    ).toHaveProperty('profile', 'function-return-scope-v1');
    const current = input.current.find((course) => course.courseId === 'python-basics')!
      .exercises[0]!;
    Reflect.set(current.runtime!, 'profile', 'function-return-scope-v1');
    expect(() => MovementInputsSchema.parse(input)).toThrow(/Retired.*function-return-scope-v1/iu);
    expect(() => {
      Reflect.apply(movementOriginals, undefined, [
        [
          {
            runtime: { id: 'python-basics' },
            authoringExercises: [current],
          },
        ],
      ]);
    }).toThrow(/Retired.*function-return-scope-v1/iu);
  });

  function executionBundle() {
    const template = releaseFixture(),
      baseline = structuredClone(fixture.baseline),
      inputs = structuredClone(fixture.inputs);
    const proof = {
      ...template.capturedBaseline.proof,
      deploymentId: baseline.deploymentId,
      sourceCommit: baseline.sourceCommit,
      artifactDigest: baseline.artifactDigest,
      inventoryDigest: hashValue(baseline.inventory),
    };
    baseline.sourceRecordDigest = hashValue(proof);
    inputs.declaration.body.baseline.sourceRecordDigest = baseline.sourceRecordDigest;
    const movementInputs = seal(inputs),
      movement = verifyMovementInputs(movementInputs, fixture.inventory, baseline);
    const plan = planRelease(fixture.inventory, baseline, movement);
    const lessonKeys = fixture.inventory.courses.flatMap((course) =>
      course.lessons.map((lesson) => course.id + '/' + lesson.id),
    );
    const exerciseIds = fixture.inventory.courses.flatMap((course) =>
      course.lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.id)),
    );
    const pythonIds = fixture.inventory.courses
      .find((course) => course.id === 'python-basics')!
      .lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.id));
    const manifests = TEST_SUITES.map(({ suite, producerJobId, project }) => ({
      suite,
      producerJobId,
      project,
      tests: [
        {
          key: 'synthetic-' + suite,
          exerciseIds:
            suite === 'browser-chromium-1'
              ? exerciseIds
              : suite === 'native-python'
                ? pythonIds
                : [],
          lessonKeys: ['browser-chromium-1', 'browser-firefox', 'browser-webkit'].includes(suite)
            ? lessonKeys
            : [],
        },
      ],
    }));
    const snapshot = { ...template.snapshot, inventory: fixture.inventory, plan, movementInputs };
    const executionPlan = createExecutionPlan(plan, manifests, hashValue(snapshot.publicContent));
    const candidate = { ...template.candidate, planDigest: hashValue({ plan, executionPlan }) };
    return { snapshot, executionPlan, candidate, capturedBaseline: { baseline, proof } };
  }

  it('execution bundle境界でも宣言と原本payloadを再検証する', () => {
    const bundle = executionBundle();
    expect(validateExecutionBundle(bundle).candidate.planDigest).toBe(bundle.candidate.planDigest);
    const changed = structuredClone(bundle);
    changed.snapshot.movementInputs.declaration.approvals[0]!.scopeDigest = '0'.repeat(64);
    expect(() => validateExecutionBundle(changed)).toThrow();
    const missing = structuredClone(bundle);
    Reflect.deleteProperty(missing.snapshot, 'movementInputs');
    expect(() => validateExecutionBundle(missing)).toThrow();
  });

  it('qualificationでも技術成功の自己申告より先に移動を再検証する', () => {
    const bundle = executionBundle();
    const movementInputs = structuredClone(bundle.snapshot.movementInputs);
    movementInputs.declaration.approvals.pop();
    expect(() =>
      qualifyRelease({
        inventory: bundle.snapshot.inventory,
        plan: bundle.snapshot.plan,
        executionPlan: bundle.executionPlan,
        candidate: bundle.candidate,
        publicContent: bundle.snapshot.publicContent,
        capturedBaseline: bundle.capturedBaseline,
        currentBaseline: bundle.capturedBaseline,
        movementInputs,
        results: [],
        contentReceipts: [],
        context: {
          repository: bundle.candidate.repository,
          runId: bundle.candidate.runId,
          sourceCommit: bundle.candidate.recipe.sourceCommit,
          currentMainCommit: bundle.candidate.recipe.sourceCommit,
          recipe: bundle.candidate.recipe,
          eventName: 'workflow_dispatch',
          ref: 'refs/heads/main',
          attempt: 1,
          now: '2026-10-28T13:00:00Z',
          jobs: {},
        },
      }),
    ).toThrow(/approvals/u);
  });

  it('private原本の実bytesを検査しscope差替えと検査者の重複を拒否する', async () => {
    const { inspectMovementReplacementOriginal } =
      await import('../../../../scripts/release/v2/movement');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'movement-original-unit-'));
    try {
      const approval = fixture.inputs.declaration.approvals[0]!;
      const { originalDigest, originalsCheckedBy, receiptDigest, ...metadata } = approval;
      void originalDigest;
      void originalsCheckedBy;
      void receiptDigest;
      const bytes = JSON.stringify({
        ...metadata,
        observationKind: 'independent-movement-replacement-observation',
        unresolvedCritical: 0,
        unresolvedImportant: 0,
        requiredUnconfirmed: 0,
      });
      await writeFile(path.join(directory, 'synthetic-unit-original.json'), bytes);
      const reference = {
        path: 'synthetic-unit-original.json',
        sha256: hashBytes(bytes),
        bytes: Buffer.byteLength(bytes),
      };
      const receipt = await inspectMovementReplacementOriginal(
        directory,
        reference,
        metadata,
        'synthetic-inspector',
      );
      expect(receipt.originalDigest).toBe(reference.sha256);
      await expect(
        inspectMovementReplacementOriginal(
          directory,
          reference,
          { ...metadata, scopeDigest: '0'.repeat(64) },
          'synthetic-inspector',
        ),
      ).rejects.toThrow(/scope/u);
      await expect(
        inspectMovementReplacementOriginal(directory, reference, metadata, metadata.reviewerId),
      ).rejects.toThrow(/Independent/u);
      await writeFile(path.join(directory, 'synthetic-unit-original.json'), bytes + ' ');
      await expect(
        inspectMovementReplacementOriginal(directory, reference, metadata, 'synthetic-inspector'),
      ).rejects.toThrow(/bytes|digest/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
