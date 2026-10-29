// @vitest-environment node
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { InventorySchema } from '../../../../scripts/release/v2/schema';
import { hashArtifact, hashValue } from '../../../../scripts/release/v2/identity';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function inventory() {
  const exercise = {
    id: 'exercise',
    kind: 'standard',
    workspaceId: 'shared',
    runtimeKind: 'html-css',
    profile: 'default',
    capability: 'html-css',
    digest: '1'.repeat(64),
    solutionSourceDigest: '2'.repeat(64),
    starterSourceDigest: '3'.repeat(64),
    fixtures: [
      {
        id: 'wrong',
        expectedStatus: 'incomplete',
        digest: '4'.repeat(64),
        sourceDigest: '5'.repeat(64),
      },
      {
        id: 'empty',
        expectedStatus: 'incomplete',
        digest: '6'.repeat(64),
        sourceDigest: '7'.repeat(64),
      },
    ],
  };
  return InventorySchema.parse({
    schemaVersion: 1,
    fingerprintVersion: 1,
    courses: [
      {
        id: 'topic',
        revision: '1',
        publicationStatus: 'published',
        runner: 'html-css',
        lessons: [
          {
            id: 'lesson',
            kind: 'guided-project',
            learnerDigest: 'a'.repeat(64),
            exerciseDigest: 'b'.repeat(64),
            navigationDigest: 'c'.repeat(64),
            persistenceDigest: 'd'.repeat(64),
            exercises: [exercise, { ...exercise, id: 'exercise-two' }],
          },
        ],
      },
    ],
  });
}
function publicContent() {
  const files = [{ path: 'catalog-v3.json', bytes: 2, sha256: 'a'.repeat(64) }];
  return { digest: hashValue(files), files };
}
function setup() {
  const current = inventory(),
    proof = {
      schemaVersion: 1,
      repository: 'owner/site',
      deploymentId: '501',
      sourceCommit: '1'.repeat(40),
      workflowHeadCommit: '2'.repeat(40),
      runId: '500',
      tag: 'refs/tags/tsumucode-release-1',
      tagDigest: 'a'.repeat(64),
      artifactDigest: 'b'.repeat(64),
      artifactDigestFormat: 'legacy-canonical-dist',
      projection: 'authoring',
      inventoryDigest: hashValue(current),
      publicContentDigest: 'c'.repeat(64),
      publicFiles: 1,
      observedAt: '2026-10-28T10:00:00Z',
    };
  const captured = {
    proof,
    baseline: {
      deploymentId: '501',
      sourceCommit: proof.sourceCommit,
      artifactDigest: proof.artifactDigest,
      sourceRecordDigest: hashValue(proof),
      inventory: structuredClone(current),
    },
  };
  const plan = planRelease(current, captured.baseline),
    manifests = TEST_SUITES.map(({ suite, producerJobId, project }) => ({
      suite,
      producerJobId,
      project,
      tests: [
        {
          key: 'case-' + suite + '/' + project,
          exerciseIds: suite === 'browser-chromium-1' ? ['exercise', 'exercise-two'] : [],
        },
      ],
    }));
  const projection = publicContent();
  const executionPlan = createExecutionPlan(plan, manifests, hashValue(projection));
  const recipe = {
    sourceCommit: '3'.repeat(40),
    sourceTree: '4'.repeat(40),
    lockDigest: 'e'.repeat(64),
    workflowDigest: 'f'.repeat(64),
    policyDigest: '1'.repeat(64),
    toolchain: 'fixed',
    basePath: '/site/',
  };
  const candidate = {
    schemaVersion: 1,
    repository: 'owner/site',
    runId: '101',
    buildJobId: 'build',
    buildAttempt: 1,
    artifactDigest: '2'.repeat(64),
    artifactId: '301',
    planDigest: hashValue({ plan, executionPlan }),
    recipe,
  };
  const results = executionPlan.requirements.map((requirement) => ({
    schemaVersion: 1,
    suite: requirement.suite,
    candidateDigest: hashValue(candidate),
    inputDigest: requirement.inputDigest,
    recipeDigest: hashValue(recipe),
    runId: '101',
    jobId: requirement.producerJobId,
    verificationAttempt: 1,
    status: 'passed',
    targets: requirement.targets,
    startedAt: '2026-10-28T12:00:00Z',
    finishedAt: '2026-10-28T12:01:00Z',
    expiresAt: '2026-10-29T12:01:00Z',
    reportDigest: '9'.repeat(64),
  }));
  return {
    inventory: current,
    publicContent: projection,
    plan,
    executionPlan,
    candidate,
    results,
    capturedBaseline: captured,
    currentBaseline: structuredClone(captured),
    contentReceipts: [],
    context: {
      repository: 'owner/site',
      runId: '101',
      sourceCommit: recipe.sourceCommit,
      currentMainCommit: recipe.sourceCommit,
      recipe,
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/main',
      attempt: 1,
      now: '2026-10-28T13:00:00Z',
      jobs: {
        build: 'success',
        unit: 'success',
        browser: 'success',
        public_boundary: 'success',
        performance: 'success',
        boundary: 'success',
      },
    },
  };
}
describe('independent review regressions', () => {
  it('re-observes unchanged actual parent without treating a new capture time as a new publication', async () => {
    const { qualifyRelease } = await import('../../../../scripts/release/v2/admission');
    const input = setup();
    input.currentBaseline.proof.observedAt = '2026-10-28T12:59:00Z';
    input.currentBaseline.baseline.sourceRecordDigest = hashValue(input.currentBaseline.proof);
    expect(qualifyRelease(input).status).toBe('qualified');
    const changed = structuredClone(input);
    changed.currentBaseline.proof.publicContentDigest = '0'.repeat(64);
    changed.currentBaseline.baseline.sourceRecordDigest = hashValue(changed.currentBaseline.proof);
    expect(() => qualifyRelease(changed)).toThrow();
  });
  it('emits only immutable non-secret protocol JSON that Linux uploaders can read', async () => {
    const { writeProtocolJson } = await import('../../../../scripts/release/v2/json');
    const root = await mkdtemp(path.join(os.tmpdir(), 'flow-readable-'));
    roots.push(root);
    const file = path.join(root, 'receipt.json');
    await writeProtocolJson(file, { schemaVersion: 1, digest: 'a'.repeat(64) });
    expect((await stat(file)).mode & 0o777).toBe(0o644);
    await expect(writeProtocolJson(file, { changed: true })).rejects.toThrow();
  });
  it('rejects uncatalogued draft JSON and draft-only assets after the one public compile', async () => {
    const { compileCourse } = await import('../../../../scripts/content/compileCourse');
    const { buildSplitContentDelivery, writeSplitContentDeliveryTree } =
      await import('../../../../scripts/content/splitContentDelivery');
    const { buildInventory } = await import('../../../../scripts/release/v2/inventory');
    const { checkStaticArtifact } = await import('../../../../scripts/release/checkStaticArtifact');
    const compilation = await compileCourse('content/html-css'),
      root = await mkdtemp(path.join(os.tmpdir(), 'flow-private-'));
    roots.push(root);
    const content = path.join(root, 'generated/content');
    await mkdir(content, { recursive: true });
    await writeSplitContentDeliveryTree(
      content,
      buildSplitContentDelivery([compilation], [], 'public'),
    );
    await writeFile(path.join(root, 'index.html'), '<p>public</p>');
    const expected = await hashArtifact(content),
      current = buildInventory([compilation]);
    expect((await checkStaticArtifact(root, current, expected)).files).toBeGreaterThan(0);
    const leaked = path.join(content, 'courses/private-topic/lessons/private.json');
    await mkdir(path.dirname(leaked), { recursive: true });
    await writeFile(
      leaked,
      JSON.stringify({ text: 'draft text never declared in the public catalog' }),
    );
    await expect(checkStaticArtifact(root, current, expected)).rejects.toThrow();
    await rm(path.join(content, 'courses/private-topic'), { recursive: true });
    const asset = path.join(content, 'assets/private-draft.png');
    await mkdir(path.dirname(asset), { recursive: true });
    await writeFile(asset, Buffer.from([137, 80, 78, 71]));
    await expect(checkStaticArtifact(root, current, expected)).rejects.toThrow();
  }, 30000);
  it.each(['removed', 'positive'])(
    'preserves existing negative fixture obligations: %s',
    (failure) => {
      const input = setup();
      const exercise = input.inventory.courses[0]!.lessons[0]!.exercises[0]!;
      if (failure === 'removed') exercise.fixtures.pop();
      else exercise.fixtures[0]!.expectedStatus = 'pass';
      expect(() => planRelease(input.inventory, input.capturedBaseline.baseline)).toThrow(
        /fixture|review/i,
      );
    },
  );
  it('marks every new Lesson engine obligation pending until real three-engine learning observation exists', () => {
    const input = setup(),
      plan = planRelease(input.inventory);
    expect(
      plan.targets.filter((row) => row.kind === 'learning-engine').map((row) => row.engine),
    ).toEqual(['chromium', 'firefox', 'webkit']);
    expect(() =>
      createExecutionPlan(plan, input.executionPlan.testManifests, hashValue(input.publicContent)),
    ).toThrow(/learning|engine|pending/i);
  });
  it('matches shared workspace identity sets rather than counting duplicate exercise aliases', async () => {
    const { observeTestSuite } = await import('../../../../scripts/release/v2/observed');
    const input = setup(),
      manifest = input.executionPlan.testManifests.find((row) => row.suite === 'browser-public')!;
    const payload = {
      rows: [{ key: 'topic/lesson/persistence', inputDigest: 'd'.repeat(64) }],
      knownCourses: ['topic'],
      workspaces: 1,
      workspaceKeys: ['topic:shared'],
      synthetic: true,
    };
    const report = {
      errors: [],
      stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
      suites: [
        {
          specs: [
            {
              id: 'case-browser-public',
              tests: [
                {
                  projectName: 'chromium',
                  expectedStatus: 'passed',
                  status: 'expected',
                  annotations: [],
                  results: [
                    {
                      status: 'passed',
                      retry: 0,
                      attachments: [
                        {
                          name: 'release-persistence-v1',
                          contentType: 'application/json',
                          body: Buffer.from(JSON.stringify(payload)).toString('base64'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(manifest.tests[0]!.exerciseIds).toEqual([]);
    expect(
      observeTestSuite('browser-public', report, input.plan, input.executionPlan, input.inventory),
    ).toContain('topic/lesson/persistence');
  });
  it('retains and verifies the actual report behind every successful receipt digest', async () => {
    const { storeSuiteReport, verifyStoredReports } =
      await import('../../../../scripts/release/v2/reports');
    const root = await mkdtemp(path.join(os.tmpdir(), 'flow-report-'));
    roots.push(root);
    const input = setup(),
      report = { actualCases: [{ sourceDigest: 'a'.repeat(64), status: 'pass' }] };
    const receipt = {
      ...input.results.find((row) => row.suite === 'unit')!,
      reportDigest: hashValue(report),
    };
    await storeSuiteReport(root, receipt, report);
    await expect(verifyStoredReports(root, [receipt])).resolves.toBeUndefined();
    const file = path.join(root, '.release-v2/reports/unit-1.json');
    expect(JSON.parse(await readFile(file, 'utf8')) as unknown).toEqual(report);
    await writeFile(file, JSON.stringify({ fake: true }));
    await expect(verifyStoredReports(root, [receipt])).rejects.toThrow();
  });
});
