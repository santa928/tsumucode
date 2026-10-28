import { z } from 'zod';
import { DigestSchema, IdSchema, TargetSchema } from './schema';
const ObservationSchema = z
  .object({
    rows: z.array(z.object({ key: z.string().min(1), inputDigest: DigestSchema }).strict()).min(1),
    knownCourses: z.array(IdSchema).min(1),
    workspaces: z.number().int().nonnegative(),
    synthetic: z.literal(true),
  })
  .strict();
/** Call only after exact frozen test execution passes. Synthetic data proves storage, never learner approval. */
export function readPersistenceCoverage(
  input: unknown,
  targetsInput: unknown,
  courseIds: readonly string[],
  workspaceCount: number,
): string[] {
  const targets = z.array(TargetSchema).min(1).parse(targetsInput);
  if (
    targets.some(({ kind }) => kind !== 'persistence') ||
    new Set(targets.map(({ key }) => key)).size !== targets.length
  )
    throw new Error('Invalid persistence targets');
  const report = z.object({ suites: z.array(z.unknown()).min(1) }).parse(input);
  const observations: z.infer<typeof ObservationSchema>[] = [];
  function visit(input: unknown) {
    const suite = z
      .object({
        specs: z
          .array(
            z.object({
              tests: z.array(
                z.object({
                  results: z.array(
                    z.object({
                      attachments: z.array(
                        z.object({
                          name: z.string(),
                          contentType: z.string().optional(),
                          body: z.string().optional(),
                        }),
                      ),
                    }),
                  ),
                }),
              ),
            }),
          )
          .default([]),
        suites: z.array(z.unknown()).default([]),
      })
      .parse(input);
    for (const spec of suite.specs)
      for (const test of spec.tests)
        for (const result of test.results)
          for (const attachment of result.attachments) {
            if (attachment.name !== 'release-persistence-v1') continue;
            if (
              attachment.contentType !== 'application/json' ||
              !attachment.body ||
              attachment.body.length > 4 * 1024 * 1024 ||
              !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
                attachment.body,
              )
            )
              throw new Error('Invalid persistence attachment');
            observations.push(
              ObservationSchema.parse(
                JSON.parse(
                  new TextDecoder('utf-8', { fatal: true }).decode(
                    Buffer.from(attachment.body, 'base64'),
                  ),
                ) as unknown,
              ),
            );
          }
    for (const child of suite.suites) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  if (observations.length !== 1) throw new Error('Missing or duplicate persistence roundtrip');
  const actual = observations[0]!;
  if (
    actual.workspaces !== workspaceCount ||
    actual.knownCourses.length !== courseIds.length ||
    new Set(actual.knownCourses).size !== courseIds.length ||
    courseIds.some((id) => !actual.knownCourses.includes(id))
  )
    throw new Error('Incomplete dormant or current storage identities');
  const required = new Map(targets.map((target) => [target.key, target.inputDigest]));
  if (
    actual.rows.length !== required.size ||
    new Set(actual.rows.map(({ key }) => key)).size !== required.size ||
    actual.rows.some((row) => required.get(row.key) !== row.inputDigest)
  )
    throw new Error('Missing, stale or duplicate persistence coverage');
  return actual.rows.map(({ key }) => key).sort();
}
