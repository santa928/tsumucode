import { z } from 'zod';
import {
  BuildIdentitySchema,
  DigestSchema,
  IdSchema,
  InventorySchema,
  RuntimeKindSchema,
  PublishedDeploymentSchema,
} from './schema';
import { hashValue, hashBytes } from './identity';
import { parseTestList, verifyTestExecution } from './testManifest';
const TargetSchema = z
  .object({
    key: z.string().min(1),
    kind: z.enum(['launch', 'reading-resume', 'progress-transfer', 'grade-persist', 'local-guide']),
    courseId: IdSchema.optional(),
    lessonId: IdSchema.optional(),
    exerciseId: IdSchema.optional(),
    runtimeKind: RuntimeKindSchema.optional(),
    capability: z.string().min(1).optional(),
  })
  .strict();
/** Public capabilities choose a representative, independently of course names and counts. */
export function planPublishedOperations(input: unknown) {
  const inventory = InventorySchema.parse(input);
  const courses = inventory.courses
    .filter((row) => row.publicationStatus === 'published')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!courses.length) throw Error('No public learning surface');
  const first = courses[0]!,
    lesson = first.lessons[0]!;
  const targets: z.infer<typeof TargetSchema>[] = [
    { key: 'launch', kind: 'launch' },
    { key: 'reading-resume', kind: 'reading-resume', courseId: first.id, lessonId: lesson.id },
    { key: 'progress-transfer', kind: 'progress-transfer' },
  ];
  const capabilities = new Map<string, z.infer<typeof TargetSchema>>();
  for (const course of courses)
    for (const lesson of course.lessons)
      for (const exercise of lesson.exercises) {
        const kind = exercise.runtimeKind === 'next' ? 'local-guide' : 'grade-persist';
        const key = exercise.runtimeKind + '/' + exercise.capability + '/' + kind;
        if (!capabilities.has(key))
          capabilities.set(key, {
            key,
            kind,
            courseId: course.id,
            lessonId: lesson.id,
            exerciseId: exercise.id,
            runtimeKind: exercise.runtimeKind,
            capability: exercise.capability,
          });
      }
  targets.push(
    ...[...capabilities.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  );
  return {
    schemaVersion: 1 as const,
    inventoryDigest: hashValue({ ...inventory, courses }),
    targets: z.array(TargetSchema).parse(targets),
  };
}
export const PublishedOperationsReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal('passed'),
    producerJobId: z.literal('report'),
    candidateDigest: DigestSchema,
    artifactDigest: DigestSchema,
    inventoryDigest: DigestSchema,
    planDigest: DigestSchema,
    reportDigest: DigestSchema,
    actual: PublishedDeploymentSchema,
    targets: z.array(z.string().min(1)).min(1),
    observedAt: z.iso.datetime(),
  })
  .strict();
/** Only the fixed report producer may attest executed operations; byte equality alone is insufficient. */
export function verifyPublishedOperationsReceipt(
  candidateInput: unknown,
  inventoryInput: unknown,
  actualInput: unknown,
  input: unknown,
  now: string,
) {
  const candidate = BuildIdentitySchema.parse(candidateInput),
    plan = planPublishedOperations(inventoryInput);
  const receipt = PublishedOperationsReceiptSchema.parse(input);
  const required = plan.targets.map((row) => row.key).sort();
  if (
    receipt.candidateDigest !== hashValue(candidate) ||
    receipt.artifactDigest !== candidate.artifactDigest ||
    receipt.inventoryDigest !== plan.inventoryDigest ||
    receipt.planDigest !== hashValue(plan) ||
    hashValue(receipt.actual) !== hashValue(actualInput) ||
    new Set(receipt.targets).size !== receipt.targets.length ||
    hashValue([...receipt.targets].sort()) !== hashValue(required) ||
    Date.parse(receipt.observedAt) > Date.parse(z.iso.datetime().parse(now)) ||
    Date.parse(receipt.actual.createdAt) > Date.parse(receipt.observedAt)
  )
    throw Error('Incomplete or mismatched public operation observation');
  return receipt;
}

const BrowserSuiteSchema = z.object({
  specs: z
    .array(
      z.object({
        tests: z.array(
          z.object({
            annotations: z
              .array(z.object({ type: z.string(), description: z.string().optional() }))
              .default([]),
            results: z.array(z.unknown()),
          }),
        ),
      }),
    )
    .default([]),
  suites: z.array(z.unknown()).default([]),
});
function operationTests(input: unknown) {
  const root = z.object({ suites: z.array(z.unknown()).min(1) }).parse(input);
  const rows: { key: string; results: unknown[] }[] = [];
  const visit = (input: unknown) => {
    const suite = BrowserSuiteSchema.parse(input);
    for (const spec of suite.specs)
      for (const test of spec.tests) {
        const keys = test.annotations
          .filter((row) => row.type === 'public-operation')
          .map((row) => row.description);
        if (keys.length !== 1 || !keys[0])
          throw Error('Missing or duplicate public operation annotation');
        rows.push({ key: keys[0], results: test.results });
      }
    for (const child of suite.suites) visit(child);
  };
  for (const suite of root.suites) visit(suite);
  return rows;
}
/** Observe passed fixed Source tests, exact scope and their actual page-origin attachments. */
export function observePublishedOperations(
  candidateInput: unknown,
  inventoryInput: unknown,
  actualInput: unknown,
  collection: unknown,
  reportBytes: Uint8Array,
  observedAt: string,
) {
  const candidate = BuildIdentitySchema.parse(candidateInput),
    plan = planPublishedOperations(inventoryInput);
  const actual = PublishedOperationsReceiptSchema.shape.actual.parse(actualInput);
  const site =
    'https://' + candidate.repository.split('/')[0]! + '.github.io' + candidate.recipe.basePath;
  if (
    actual.repository !== candidate.repository ||
    actual.runId !== candidate.runId ||
    new URL(actual.siteUrl).href !== site
  )
    throw Error('Wrong actual public operation deployment');
  if (reportBytes.length > 16 * 1024 * 1024) throw Error('Public operation report exceeds limit');
  const report: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(reportBytes));
  const manifest = parseTestList(collection, 'public-operations', 'report', 'chromium');
  verifyTestExecution(report, manifest);
  const source = operationTests(collection),
    executed = operationTests(report),
    required = plan.targets.map((row) => row.key).sort();
  for (const rows of [source, executed])
    if (
      new Set(rows.map((row) => row.key)).size !== rows.length ||
      hashValue(rows.map((row) => row.key).sort()) !== hashValue(required)
    )
      throw Error('Public operation scope differs from compiler inventory');
  for (const row of executed) {
    const result = z
      .object({
        attachments: z
          .array(
            z.object({ name: z.string(), contentType: z.string(), body: z.string().optional() }),
          )
          .default([]),
      })
      .parse(row.results[0]);
    const attachments = result.attachments.filter((item) => item.name === 'public-operation');
    const attachment = attachments[0];
    if (
      attachments.length !== 1 ||
      attachment?.contentType !== 'application/json' ||
      !attachment.body ||
      attachment.body.length > 131072
    )
      throw Error('Missing actual public operation observation');
    const bytes = Buffer.from(attachment.body, 'base64');
    if (bytes.toString('base64') !== attachment.body)
      throw Error('Invalid public operation attachment');
    const proof = z
      .object({
        key: z.string(),
        candidateDigest: DigestSchema,
        artifactDigest: DigestSchema,
        siteUrl: z.url(),
      })
      .strict()
      .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown);
    if (
      proof.key !== row.key ||
      proof.candidateDigest !== hashValue(candidate) ||
      proof.artifactDigest !== candidate.artifactDigest ||
      new URL(proof.siteUrl).href !== site
    )
      throw Error('Public operation observed another candidate or actual origin');
  }
  return verifyPublishedOperationsReceipt(
    candidate,
    inventoryInput,
    actual,
    {
      schemaVersion: 1,
      status: 'passed',
      producerJobId: 'report',
      candidateDigest: hashValue(candidate),
      artifactDigest: candidate.artifactDigest,
      inventoryDigest: plan.inventoryDigest,
      planDigest: hashValue(plan),
      reportDigest: hashBytes(reportBytes),
      actual,
      targets: required,
      observedAt,
    },
    observedAt,
  );
}
