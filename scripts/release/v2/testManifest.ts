import { z } from 'zod';
import { IdSchema, JobKeySchema } from './schema';
const ProjectSchema = z.string().regex(/^(?:[a-z][a-z0-9-]*|)$/u);
export const TestSuiteManifestSchema = z
  .object({
    suite: IdSchema,
    producerJobId: JobKeySchema,
    project: ProjectSchema,
    tests: z
      .array(z.object({ key: z.string().min(1).max(300), exerciseIds: z.array(IdSchema) }).strict())
      .min(1),
  })
  .strict();
export type TestSuiteManifest = z.infer<typeof TestSuiteManifestSchema>;
const SuiteSchema = z.object({
  specs: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/u),
        tests: z
          .array(
            z.object({
              projectName: ProjectSchema,
              expectedStatus: z.literal('passed'),
              status: z.string().optional(),
              results: z.array(z.unknown()),
              annotations: z
                .array(z.object({ type: z.string(), description: z.string().optional() }))
                .default([]),
            }),
          )
          .min(1),
      }),
    )
    .default([]),
  suites: z.array(z.unknown()).default([]),
});
function collect(input: unknown, project: string, executed: boolean) {
  const report = z
    .object({ errors: z.array(z.unknown()).default([]), suites: z.array(z.unknown()).min(1) })
    .parse(input);
  if (report.errors.length) throw new Error('Test collection or execution errors');
  const entries: { key: string; exerciseIds: string[] }[] = [];
  function visit(value: unknown): void {
    const suite = SuiteSchema.parse(value);
    for (const spec of suite.specs)
      for (const test of spec.tests) {
        if (test.projectName !== project) throw new Error('Wrong test project');
        if (executed) {
          if (test.status !== 'expected' || test.results.length !== 1)
            throw new Error('Failed, retried or unexecuted test');
          z.object({ status: z.literal('passed'), retry: z.literal(0) }).parse(test.results[0]);
        } else if (test.results.length)
          throw new Error('Executed report cannot replace independent test collection');
        const exerciseIds = test.annotations
          .filter(({ type }) => type === 'release-exercise')
          .map(({ description }) => IdSchema.parse(description));
        if (new Set(exerciseIds).size !== exerciseIds.length)
          throw new Error('Duplicate exercise annotation');
        entries.push({ key: spec.id + '/' + project, exerciseIds });
      }
    for (const child of suite.suites) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  if (!entries.length || new Set(entries.map(({ key }) => key)).size !== entries.length)
    throw new Error('Empty or duplicate test inventory');
  return entries;
}
/** Freeze independent --list output from this exact checkout, not the execution self-report. */
export function parseTestList(
  input: unknown,
  suite: string,
  producerJobId: string,
  project: string,
): TestSuiteManifest {
  return TestSuiteManifestSchema.parse({
    suite,
    producerJobId,
    project,
    tests: collect(input, project, false),
  });
}
/** A green summary cannot conceal an omitted test, new skip, flaky retry or another project's report. */
export function verifyTestExecution(input: unknown, manifestInput: unknown): string[] {
  const manifest = TestSuiteManifestSchema.parse(manifestInput);
  const report = z
    .object({
      stats: z.object({
        expected: z.number().int().positive(),
        unexpected: z.literal(0),
        skipped: z.literal(0),
        flaky: z.literal(0),
      }),
    })
    .parse(input);
  const actual = collect(input, manifest.project, true),
    required = new Map(manifest.tests.map((test) => [test.key, test]));
  if (
    report.stats.expected !== actual.length ||
    actual.length !== required.size ||
    actual.some((test) => {
      const expected = required.get(test.key);
      return (
        !expected ||
        JSON.stringify([...expected.exerciseIds].sort()) !==
          JSON.stringify([...test.exerciseIds].sort())
      );
    })
  )
    throw new Error('Executed tests differ from the frozen source inventory');
  return actual.map(({ key }) => 'test/' + manifest.suite + '/' + key).sort();
}
