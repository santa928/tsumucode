// @vitest-environment node
import { expect, it } from 'vitest';
import { releaseFixture } from './releaseFixture';
const digest = 'a'.repeat(64);
function inventory() {
  const value = releaseFixture().snapshot.inventory;
  value.courses[0]!.lessons[0]!.exercises.push({
    id: 'first-exercise',
    kind: 'standard',
    workspaceId: 'first-workspace',
    runtimeKind: 'html-css',
    profile: 'default',
    capability: 'html-css',
    digest,
    solutionSourceDigest: digest,
    starterSourceDigest: digest,
    fixtures: [],
  });
  return value;
}
it('derives public operations from published capabilities without a fixed course or lesson count', async () => {
  const module = await import('../../../../scripts/release/v2/publishedOperations');
  const first = inventory();
  const extra = structuredClone(first.courses[0]!);
  extra.id = 'future-theme';
  extra.runner = 'javascript';
  extra.lessons[0]!.id = 'future-lesson';
  extra.lessons[0]!.exercises[0]!.id = 'future-exercise';
  extra.lessons[0]!.exercises[0]!.workspaceId = 'future-workspace';
  extra.lessons[0]!.exercises[0]!.runtimeKind = 'javascript';
  extra.lessons[0]!.exercises[0]!.capability = 'browser-console';
  const before = module.planPublishedOperations(first);
  const after = module.planPublishedOperations({ ...first, courses: [...first.courses, extra] });
  expect(before.targets.map((row) => row.key)).toEqual(
    expect.arrayContaining(['launch', 'reading-resume', 'progress-transfer']),
  );
  expect(
    after.targets
      .filter((row) => row.kind === 'grade-persist')
      .map((row) => row.runtimeKind)
      .sort(),
  ).toEqual(['html-css', 'javascript']);
  expect(after.targets.find((row) => row.runtimeKind === 'javascript')).toMatchObject({
    courseId: 'future-theme',
    lessonId: 'future-lesson',
    exerciseId: 'future-exercise',
  });
});
it('does not turn a draft theme or duplicate capability into additional public operations', async () => {
  const { planPublishedOperations } =
    await import('../../../../scripts/release/v2/publishedOperations');
  const value = inventory(),
    next = structuredClone(value.courses[0]!);
  next.id = 'draft-theme';
  next.publicationStatus = 'draft';
  const plan = planPublishedOperations(value);
  expect(planPublishedOperations({ ...value, courses: [...value.courses, next] })).toEqual(plan);
  next.publicationStatus = 'published';
  expect(
    planPublishedOperations({ ...value, courses: [...value.courses, next] }).targets.filter(
      (row) => row.kind === 'grade-persist',
    ),
  ).toHaveLength(1);
});
it('refuses an inventory with no public learning surface or an unknown execution mode', async () => {
  const { planPublishedOperations } =
    await import('../../../../scripts/release/v2/publishedOperations');
  const value = inventory();
  expect(() =>
    planPublishedOperations({
      ...value,
      courses: value.courses.map((row) => ({ ...row, publicationStatus: 'draft' })),
    }),
  ).toThrow();
  expect(() =>
    planPublishedOperations({
      ...value,
      courses: [{ ...value.courses[0], runner: 'unknown-engine' }],
    }),
  ).toThrow();
});
it.each(['candidate', 'artifact', 'actual', 'plan', 'missing', 'duplicate', 'future', 'producer'])(
  'rejects %s public-operation evidence before record construction',
  async (kind) => {
    const { verifyPublishedOperationsReceipt } =
      await import('../../../../scripts/release/v2/publishedOperations');
    const { syntheticPublishedOperations } = await import('./releaseFixture');
    const value = inventory(),
      candidate = releaseFixture().candidate;
    const actual = {
      repository: 'owner/site',
      deploymentId: '501',
      workflowHeadCommit: candidate.recipe.sourceCommit,
      runId: candidate.runId,
      siteUrl: 'https://owner.github.io/site/',
    };
    const proof = await syntheticPublishedOperations(
      candidate,
      value,
      actual,
      '2026-10-29T04:00:00Z',
    );
    if (kind === 'candidate') proof.candidateDigest = '0'.repeat(64);
    if (kind === 'artifact') proof.artifactDigest = '0'.repeat(64);
    if (kind === 'actual') proof.actual.siteUrl = 'https://wrong.invalid/';
    if (kind === 'plan') proof.planDigest = '0'.repeat(64);
    if (kind === 'missing') proof.targets.pop();
    if (kind === 'duplicate') proof.targets.push(proof.targets[0]!);
    if (kind === 'future') proof.observedAt = '2026-10-30T04:00:00Z';
    const input = kind === 'producer' ? { ...proof, producerJobId: 'arbitrary' } : proof;
    expect(() =>
      verifyPublishedOperationsReceipt(candidate, value, actual, input, '2026-10-29T04:01:00Z'),
    ).toThrow();
  },
);
function browserReport(
  plan: { targets: { key: string }[] },
  candidate: { artifactDigest: string },
  candidateDigest: string,
  executed: boolean,
) {
  return {
    errors: [],
    stats: { expected: plan.targets.length, unexpected: 0, skipped: 0, flaky: 0 },
    suites: [
      {
        specs: plan.targets.map((row, index) => ({
          id: 'op' + String(index),
          tests: [
            {
              projectName: 'chromium',
              expectedStatus: 'passed',
              ...(executed ? { status: 'expected' } : {}),
              annotations: [{ type: 'public-operation', description: row.key }],
              results: executed
                ? [
                    {
                      status: 'passed',
                      retry: 0,
                      attachments: [
                        {
                          name: 'public-operation',
                          contentType: 'application/json',
                          body: Buffer.from(
                            JSON.stringify({
                              key: row.key,
                              candidateDigest,
                              artifactDigest: candidate.artifactDigest,
                              siteUrl: 'https://owner.github.io/site/',
                            }),
                          ).toString('base64'),
                        },
                      ],
                    },
                  ]
                : [],
            },
          ],
        })),
      },
    ],
  };
}
it.each(['passed', 'missing', 'skip', 'retry', 'wrong-url', 'wrong-key', 'wrong-project', 'empty'])(
  'observes actual public-operation %s against independent collection and real page-origin attachments',
  async (kind) => {
    const module = await import('../../../../scripts/release/v2/publishedOperations');
    const { hashValue } = await import('../../../../scripts/release/v2/identity');
    const value = inventory(),
      candidate = releaseFixture().candidate,
      plan = module.planPublishedOperations(value);
    const actual = {
      repository: 'owner/site',
      deploymentId: '501',
      workflowHeadCommit: candidate.recipe.sourceCommit,
      runId: candidate.runId,
      siteUrl: 'https://owner.github.io/site/',
    };
    const collected = browserReport(plan, candidate, hashValue(candidate), false),
      report = browserReport(plan, candidate, hashValue(candidate), true);
    if (kind === 'missing') report.suites[0]!.specs.pop();
    if (kind === 'skip') report.stats.skipped = 1;
    if (kind === 'retry') report.suites[0]!.specs[0]!.tests[0]!.results[0]!.retry = 1;
    if (kind === 'wrong-url')
      report.suites[0]!.specs[0]!.tests[0]!.results[0]!.attachments[0]!.body = Buffer.from(
        JSON.stringify({
          key: 'launch',
          candidateDigest: hashValue(candidate),
          artifactDigest: candidate.artifactDigest,
          siteUrl: 'http://127.0.0.1:4173/site/',
        }),
      ).toString('base64');
    if (kind === 'wrong-key')
      report.suites[0]!.specs[0]!.tests[0]!.annotations[0]!.description = 'not-required';
    if (kind === 'wrong-project') report.suites[0]!.specs[0]!.tests[0]!.projectName = 'firefox';
    if (kind === 'empty') report.suites = [];
    const observe = Reflect.get(module, 'observePublishedOperations') as (
      ...args: unknown[]
    ) => unknown;
    const call = () =>
      observe(
        candidate,
        value,
        actual,
        collected,
        Buffer.from(JSON.stringify(report)),
        '2026-10-29T04:00:00Z',
      );
    if (kind === 'passed')
      expect(call()).toMatchObject({
        status: 'passed',
        producerJobId: 'report',
        targets: plan.targets.map((row) => row.key).sort(),
      });
    else expect(call).toThrow();
  },
);
it('observes hosted Next through its actual static Local guide without claiming hosted Native grading', async () => {
  const { planPublishedOperations } =
    await import('../../../../scripts/release/v2/publishedOperations');
  const value = inventory(),
    exercise = value.courses[0]!.lessons[0]!.exercises[0]!;
  exercise.runtimeKind = 'next';
  exercise.capability = 'next-routing';
  const plan = planPublishedOperations(value);
  expect(plan.targets.find((row) => row.exerciseId === exercise.id)).toMatchObject({
    kind: 'local-guide',
    key: 'next/next-routing/local-guide',
  });
  expect(plan.targets.filter((row) => row.kind === 'grade-persist')).toEqual([]);
});
