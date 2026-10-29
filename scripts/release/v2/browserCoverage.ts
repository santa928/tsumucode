import { z } from 'zod';
import { DigestSchema, TargetSchema } from './schema';
export const FixtureObservationSchema = z
  .object({
    schemaVersion: z.literal(1),
    key: z.string().min(1),
    inputDigest: DigestSchema,
    sourceDigest: DigestSchema,
    actualStatus: z.enum(['pass', 'incomplete', 'code-error', 'system-error']),
  })
  .strict();
export type FixtureObservation = z.infer<typeof FixtureObservationSchema>;
const AttachmentSchema = z.object({
  name: z.string(),
  contentType: z.string().optional(),
  body: z.string().optional(),
});
const TestSchema = z.object({
  projectName: z.string(),
  status: z.literal('expected'),
  expectedStatus: z.literal('passed'),
  results: z
    .array(
      z.object({
        status: z.literal('passed'),
        retry: z.literal(0),
        attachments: z.array(AttachmentSchema),
      }),
    )
    .length(1),
});
const SuiteSchema = z.object({
  specs: z.array(z.object({ tests: z.array(TestSchema).min(1) })).default([]),
  suites: z.array(z.unknown()).default([]),
});
/** A successful command without actual exact coverage is insufficient. Only inline attachments are read. */
export function readBrowserCoverage(
  input: unknown,
  targetInput: unknown,
  project: string,
): string[] {
  const targets = z.array(TargetSchema).parse(targetInput);
  if (new Set(targets.map(({ key }) => key)).size !== targets.length)
    throw new Error('Duplicate required fixture');
  if (
    targets.some(
      ({ kind, sourceDigest, expectedStatus }) =>
        kind !== 'fixture' || !sourceDigest || !expectedStatus,
    )
  )
    throw new Error('Incomplete fixture contract');
  const report = z
    .object({
      stats: z.object({
        expected: z.number().int().positive(),
        unexpected: z.literal(0),
        flaky: z.literal(0),
        skipped: z.literal(0),
      }),
      suites: z.array(z.unknown()).min(1),
      errors: z.array(z.unknown()).optional(),
    })
    .parse(input);
  if (report.errors?.length) throw new Error('Browser execution errors');
  const observations: FixtureObservation[] = [];
  let tests = 0;
  function visit(input: unknown): void {
    const suite = SuiteSchema.parse(input);
    for (const spec of suite.specs)
      for (const test of spec.tests) {
        if (test.projectName !== project) throw new Error('Wrong browser project');
        tests += 1;
        for (const attachment of test.results[0]!.attachments) {
          if (attachment.name !== 'release-fixtures-v1') continue;
          if (
            attachment.contentType !== 'application/json' ||
            !attachment.body ||
            attachment.body.length > 4 * 1024 * 1024 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
              attachment.body,
            )
          )
            throw new Error('Invalid inline fixture observation');
          const source = new TextDecoder('utf-8', { fatal: true }).decode(
            Buffer.from(attachment.body, 'base64'),
          );
          observations.push(
            ...z
              .array(FixtureObservationSchema)
              .min(1)
              .parse(JSON.parse(source) as unknown),
          );
        }
      }
    for (const child of suite.suites) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  if (tests === 0 || tests !== report.stats.expected)
    throw new Error('Incomplete browser test results');
  const required = new Map(targets.map((target) => [target.key, target]));
  const observed = new Set<string>();
  for (const row of observations) {
    const target = required.get(row.key);
    if (
      !target ||
      observed.has(row.key) ||
      row.inputDigest !== target.inputDigest ||
      row.sourceDigest !== target.sourceDigest ||
      (target.expectedStatus === 'not-pass'
        ? row.actualStatus === 'pass' || row.actualStatus === 'system-error'
        : row.actualStatus !== target.expectedStatus)
    )
      throw new Error('Missing, duplicate or mismatched actual fixture observation');
    observed.add(row.key);
  }
  if (observed.size !== required.size) throw new Error('Missing actual fixture observation');
  return [...observed].sort();
}
