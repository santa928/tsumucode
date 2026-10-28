import { z } from 'zod';

export const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const CommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
export const JobKeySchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);
export const IdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
export const RuntimeKindSchema = z.enum([
  'html-css',
  'javascript',
  'typescript',
  'react',
  'next',
  'python',
  'tailwind',
]);
export const FixtureSchema = z
  .object({
    id: IdSchema,
    expectedStatus: z.enum(['pass', 'incomplete', 'code-error', 'system-error']),
    digest: DigestSchema,
  })
  .strict();
export const ExerciseInventorySchema = z
  .object({
    id: IdSchema,
    kind: z.enum(['standard', 'guided-project', 'capstone']),
    workspaceId: IdSchema,
    runtimeKind: RuntimeKindSchema,
    profile: z.string().min(1),
    capability: z.string().min(1),
    digest: DigestSchema,
    fixtures: z.array(FixtureSchema),
  })
  .strict();
export const LessonInventorySchema = z
  .object({
    id: IdSchema,
    kind: z.enum(['standard', 'guided-project', 'capstone']),
    learnerDigest: DigestSchema,
    exerciseDigest: DigestSchema,
    navigationDigest: DigestSchema,
    persistenceDigest: DigestSchema,
    exercises: z.array(ExerciseInventorySchema),
  })
  .strict();
export const CourseInventorySchema = z
  .object({
    id: IdSchema,
    revision: z.string().min(1),
    publicationStatus: z.enum(['draft', 'published']),
    runner: RuntimeKindSchema,
    lessons: z.array(LessonInventorySchema).min(1),
  })
  .strict();
export const InventorySchema = z
  .object({
    schemaVersion: z.literal(1),
    fingerprintVersion: z.literal(1),
    courses: z.array(CourseInventorySchema).min(1),
  })
  .strict();
export type ReleaseInventory = z.infer<typeof InventorySchema>;
export type CourseInventory = z.infer<typeof CourseInventorySchema>;
export type LessonInventory = z.infer<typeof LessonInventorySchema>;
export const TargetSchema = z
  .object({
    key: z.string().min(1),
    kind: z.enum(['fixture', 'content', 'learning', 'project', 'persistence']),
    courseId: IdSchema,
    lessonId: IdSchema,
    exerciseId: IdSchema.optional(),
    fixtureId: IdSchema.optional(),
    caseKind: z.enum(['solution', 'starter', 'authored']).optional(),
    runtimeKind: RuntimeKindSchema.optional(),
    mode: z.enum(['browser', 'pyodide', 'cpython', 'local']).optional(),
    role: z.enum(['novice', 'recovery', 'maker']).optional(),
    inputDigest: DigestSchema,
  })
  .strict();
export const PlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    inventoryDigest: DigestSchema,
    parent: z
      .object({ deploymentId: z.string().regex(/^[1-9]\d*$/u), sourceRecordDigest: DigestSchema })
      .strict()
      .nullable(),
    publishedCourses: z.array(IdSchema).min(1),
    targets: z.array(TargetSchema).min(1),
  })
  .strict();
export type ReleaseTarget = z.infer<typeof TargetSchema>;
export type ReleasePlan = z.infer<typeof PlanSchema>;

export const RecipeSchema = z
  .object({
    sourceCommit: CommitSchema,
    sourceTree: CommitSchema,
    lockDigest: DigestSchema,
    workflowDigest: DigestSchema,
    policyDigest: DigestSchema,
    toolchain: z.string().min(1),
    basePath: z.string().regex(/^\/(?:[a-z0-9-]+\/)?$/u),
  })
  .strict();
export const BuildIdentitySchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
    runId: z.string().regex(/^[1-9]\d*$/u),
    buildJobId: JobKeySchema,
    buildAttempt: z.number().int().positive(),
    artifactDigest: DigestSchema,
    artifactId: z.string().regex(/^[1-9]\d*$/u),
    planDigest: DigestSchema,
    recipe: RecipeSchema,
  })
  .strict();
export type BuildIdentity = z.infer<typeof BuildIdentitySchema>;
export const SuiteResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    suite: IdSchema,
    candidateDigest: DigestSchema,
    inputDigest: DigestSchema,
    recipeDigest: DigestSchema,
    runId: z.string().regex(/^[1-9]\d*$/u),
    jobId: JobKeySchema,
    verificationAttempt: z.number().int().positive(),
    status: z.enum(['passed', 'failed', 'pending']),
    targets: z.array(z.string().min(1)),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    reportDigest: DigestSchema,
  })
  .strict();
export type SuiteResult = z.infer<typeof SuiteResultSchema>;
