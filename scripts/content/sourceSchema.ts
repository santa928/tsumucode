/** Authoring YAMLのstrict構造と、公開Schemaへ組み立てる前のSource契約を定義する。 */
import { z } from 'zod';
import {
  ConceptDefinitionSchema,
  ConceptRequirementSchema,
  ContentProgressMigrationSchema,
  HintSchema,
  MasteryLevelSchema,
  PreviewViewportSchema,
  ScreenBudgetSchema,
  SlideLayoutSchema,
  ValidationRuleDefinitionSchema,
} from '../../src/core/content/schema';

const IdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'IDはlower-kebab-caseで指定してください');
const TextSchema = z.string().trim().min(1, '空でない文字列を指定してください');

/** platform差やdecodeで別pathにならないcanonical POSIX相対pathかを判定する。 */
function isCanonicalRelativePath(value: string): boolean {
  if (value.length === 0 || value !== value.trim()) return false;
  if (value.normalize('NFC') !== value) return false;
  if (value.startsWith('/') || value.includes('\\') || value.includes(':')) return false;
  if (value.includes('%') || value.includes('?') || value.includes('#')) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 31) ||
        (codePoint >= 127 && codePoint <= 159) ||
        codePoint === 0xfeff)
    ) {
      return false;
    }
  }
  const segments = value.split('/');
  return !segments.some((segment) => segment === '' || segment === '.' || segment === '..');
}

export const SourcePathSchema = z
  .string()
  .refine(isCanonicalRelativePath, '安全なSource相対Pathで指定してください');
export const WorkspacePathSchema = z
  .string()
  .refine(isCanonicalRelativePath, '安全なWorkspace相対Pathで指定してください');

export const ExerciseStepSourceSchema = z
  .object({
    id: IdSchema,
    file: WorkspacePathSchema,
    target: TextSchema,
    starterAnchor: TextSchema,
    change: TextSchema,
    observe: TextSchema,
    requiresConceptIds: z.array(IdSchema).min(1),
    validationRuleIds: z.array(IdSchema).min(1),
  })
  .strict();

export const AssetSourceSchema = z
  .object({
    id: IdSchema,
    source: SourcePathSchema,
    mediaType: z.enum(['image', 'font', 'other']),
    alt: z.string().optional(),
    provenanceId: IdSchema,
  })
  .strict();

export const FileSourceSchema = z
  .object({
    path: WorkspacePathSchema,
    language: IdSchema,
    source: SourcePathSchema,
    editable: z.boolean(),
  })
  .strict();

export const FixtureSourceSchema = z
  .object({
    id: IdSchema,
    expectedStatus: z.enum(['pass', 'incomplete', 'code-error', 'system-error']),
    files: z.array(FileSourceSchema).min(1),
    expectedFeedbackRuleIds: z.array(IdSchema),
  })
  .strict();

const ExerciseBaseSchema = z
  .object({
    id: IdSchema,
    workspaceId: IdSchema,
    countsTowardStandardExerciseTotal: z.boolean(),
    title: TextSchema,
    instructionsSource: SourcePathSchema,
    requiresConcepts: z.array(ConceptRequirementSchema).min(1).optional(),
    scaffoldLevel: MasteryLevelSchema.optional(),
    steps: z.array(ExerciseStepSourceSchema).min(1).optional(),
    files: z.array(FileSourceSchema).min(1),
    solutionFiles: z.array(FileSourceSchema).min(1),
    validationRules: z.array(ValidationRuleDefinitionSchema).min(1),
    hints: z.array(HintSchema).length(3),
    relatedSlideIds: z.array(IdSchema).min(1),
    previewViewports: z.array(PreviewViewportSchema).min(1),
    assets: z.array(AssetSourceSchema),
    fixtures: z.array(FixtureSourceSchema).min(1),
  })
  .strict();

const StandardExerciseSourceSchema = ExerciseBaseSchema.extend({
  kind: z.literal('standard'),
}).strict();
const GuidedExerciseSourceSchema = ExerciseBaseSchema.extend({
  kind: z.literal('guided-project'),
  projectId: IdSchema,
}).strict();
const CapstoneExerciseSourceSchema = ExerciseBaseSchema.extend({
  kind: z.literal('capstone'),
  projectId: IdSchema,
}).strict();

/** 配列内の重複文字列を検出する。 */
function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/** File集合をvirtual pathと言語の比較可能なsignatureへ変換する。 */
function fileSignatures(files: readonly z.infer<typeof FileSourceSchema>[]): string[] {
  return files.map(({ path, language }) => `${path}\u0000${language}`).sort();
}

/** 2つのFile集合がvirtual pathと言語まで一致するかを判定する。 */
function hasSameFileSet(
  left: readonly z.infer<typeof FileSourceSchema>[],
  right: readonly z.infer<typeof FileSourceSchema>[],
): boolean {
  const leftSignatures = fileSignatures(left);
  const rightSignatures = fileSignatures(right);
  return (
    leftSignatures.length === rightSignatures.length &&
    leftSignatures.every((signature, index) => signature === rightSignatures[index])
  );
}

export const ExerciseSourceSchema = z
  .discriminatedUnion('kind', [
    StandardExerciseSourceSchema,
    GuidedExerciseSourceSchema,
    CapstoneExerciseSourceSchema,
  ])
  .superRefine((exercise, context) => {
    const ruleIds = exercise.validationRules.map(({ id }) => id);
    if (hasDuplicates(ruleIds)) {
      context.addIssue({
        code: 'custom',
        path: ['validationRules'],
        message: 'Rule IDが重複しています',
      });
    }
    if (hasDuplicates(exercise.fixtures.map(({ id }) => id))) {
      context.addIssue({
        code: 'custom',
        path: ['fixtures'],
        message: 'Fixture IDが重複しています',
      });
    }
    if (hasDuplicates(exercise.files.map(({ path }) => path))) {
      context.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'Starter File pathが重複しています',
      });
    }
    if (!exercise.files.some(({ editable }) => editable)) {
      context.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'Starterにeditable Fileが必要です',
      });
    }
    if (hasDuplicates(exercise.solutionFiles.map(({ path }) => path))) {
      context.addIssue({
        code: 'custom',
        path: ['solutionFiles'],
        message: 'Solution File pathが重複しています',
      });
    }
    if (!hasSameFileSet(exercise.files, exercise.solutionFiles)) {
      context.addIssue({
        code: 'custom',
        path: ['solutionFiles'],
        message: 'SolutionはStarterとpath/language集合を一致させてください',
      });
    }
    if (exercise.solutionFiles.some(({ editable }) => editable)) {
      context.addIssue({
        code: 'custom',
        path: ['solutionFiles'],
        message: 'Solution Fileはeditable=falseにしてください',
      });
    }

    const ruleIdSet = new Set(ruleIds);
    for (const [fixtureIndex, fixture] of exercise.fixtures.entries()) {
      const path = ['fixtures', fixtureIndex] as const;
      if (hasDuplicates(fixture.files.map(({ path: filePath }) => filePath))) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'files'],
          message: 'Fixture File pathが重複しています',
        });
      }
      if (!hasSameFileSet(exercise.files, fixture.files)) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'files'],
          message: 'FixtureはStarterとpath/language集合を一致させてください',
        });
      }
      if (fixture.files.some(({ editable }) => editable)) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'files'],
          message: 'Fixture Fileはeditable=falseにしてください',
        });
      }
      if (hasDuplicates(fixture.expectedFeedbackRuleIds)) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'expectedFeedbackRuleIds'],
          message: 'Fixture Feedback Rule IDが重複しています',
        });
      }
      for (const [ruleIndex, ruleId] of fixture.expectedFeedbackRuleIds.entries()) {
        if (!ruleIdSet.has(ruleId)) {
          context.addIssue({
            code: 'custom',
            path: [...path, 'expectedFeedbackRuleIds', ruleIndex],
            message: `FixtureのFeedback Rule参照先がありません: ${ruleId}`,
          });
        }
      }
      if (fixture.expectedStatus === 'pass' && fixture.expectedFeedbackRuleIds.length > 0) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'expectedFeedbackRuleIds'],
          message: 'pass FixtureのFeedback Ruleは空にしてください',
        });
      }
      if (fixture.expectedStatus === 'system-error' && fixture.expectedFeedbackRuleIds.length > 0) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'expectedFeedbackRuleIds'],
          message: 'system-error FixtureのRule Feedbackは空にしてください',
        });
      }
      if (fixture.expectedStatus === 'incomplete' && fixture.expectedFeedbackRuleIds.length === 0) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'expectedFeedbackRuleIds'],
          message: 'incomplete FixtureにはFeedback Ruleが必要です',
        });
      }
    }
  });

export const SlideFrontmatterSchema = z
  .object({
    id: IdSchema,
    title: TextSchema,
    kind: z.enum([
      'concept',
      'comparison',
      'diagram',
      'code',
      'reflection',
      'brief',
      'guide',
      'checklist',
    ]),
    concept: TextSchema.optional(),
    layout: SlideLayoutSchema.optional(),
    teachesConceptIds: z.array(IdSchema).min(1).optional(),
    masteryTarget: MasteryLevelSchema.optional(),
    screenBudget: ScreenBudgetSchema.optional(),
    assets: z.array(AssetSourceSchema).default([]),
  })
  .strict();

const ChecklistItemSourceSchema = z
  .object({
    id: IdSchema,
    label: TextSchema,
    required: z.boolean(),
    ruleIds: z.array(IdSchema).min(1),
  })
  .strict();

export const ProjectSourceSchema = z
  .object({
    id: IdSchema,
    briefSource: SourcePathSchema,
    guideSources: z.array(SourcePathSchema),
    checklist: z.array(ChecklistItemSourceSchema).min(1),
  })
  .strict();

const GlossaryEntrySourceSchema = z
  .object({
    id: IdSchema,
    term: TextSchema,
    definition: TextSchema,
    firstSlideId: IdSchema,
    relatedIds: z.array(IdSchema),
  })
  .strict();

export const GlossarySourceSchema = z
  .object({ schemaVersion: z.literal(1), entries: z.array(GlossaryEntrySourceSchema) })
  .strict();

const ProvenanceMethodSchema = z.enum([
  'original-authored',
  'original-svg',
  'image-generation',
  'third-party',
]);
const ProvenanceLicenseSchema = z.enum(['project-original', 'CC0-1.0', 'CC-BY-4.0', 'OFL-1.1']);

const ProvenanceDefaultsSchema = z
  .object({
    method: ProvenanceMethodSchema,
    createdAt: TextSchema,
    creator: TextSchema,
    sourceUrl: TextSchema,
    license: ProvenanceLicenseSchema,
    modified: z.boolean(),
  })
  .strict();

const ProvenanceItemSourceSchema = z
  .object({
    id: IdSchema,
    visibility: z.enum(['public', 'authoring']),
    path: SourcePathSchema,
    method: ProvenanceMethodSchema.optional(),
    createdAt: TextSchema.optional(),
    creator: TextSchema.optional(),
    sourceUrl: TextSchema.optional(),
    license: ProvenanceLicenseSchema.optional(),
    modified: z.boolean().optional(),
    promptPath: SourcePathSchema.optional(),
  })
  .strict();

const PublicProvenanceItemSchema = z
  .object({
    id: IdSchema,
    visibility: z.literal('public'),
    path: SourcePathSchema,
    method: ProvenanceMethodSchema.optional(),
    createdAt: TextSchema.optional(),
    creator: TextSchema.optional(),
    sourceUrl: TextSchema.optional(),
    license: ProvenanceLicenseSchema.optional(),
    modified: z.boolean().optional(),
  })
  .strict();

export const ProvenanceSourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaults: ProvenanceDefaultsSchema,
    items: z.array(ProvenanceItemSourceSchema),
  })
  .strict();

export const PublicProvenanceManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    defaults: ProvenanceDefaultsSchema,
    items: z.array(PublicProvenanceItemSchema),
  })
  .strict();

const LessonBaseShape = {
  id: IdSchema,
  title: TextSchema,
  goal: TextSchema,
  estimatedMinutes: z.number().int().positive(),
  prerequisiteLessonIds: z.array(IdSchema),
  exerciseSources: z.array(SourcePathSchema).min(1),
  reflection: TextSchema,
  glossaryRefs: z.array(IdSchema),
  nextLessonId: IdSchema.optional(),
};

const StandardLessonSourceSchema = z
  .object({
    ...LessonBaseShape,
    kind: z.literal('standard'),
    slideSources: z.array(SourcePathSchema).min(1),
    completion: z
      .object({
        kind: z.literal('standard'),
        finalSlideId: IdSchema,
        requiredExerciseIds: z.array(IdSchema).min(1),
      })
      .strict(),
  })
  .strict();

const GuidedLessonSourceSchema = z
  .object({
    ...LessonBaseShape,
    kind: z.literal('guided-project'),
    slideSources: z.array(SourcePathSchema),
    project: ProjectSourceSchema,
    completion: z
      .object({
        kind: z.literal('guided-project'),
        requiredChecklistItemIds: z.array(IdSchema).min(1),
        requiredExerciseIds: z.array(IdSchema).min(1),
      })
      .strict(),
  })
  .strict();

const CapstoneLessonSourceSchema = z
  .object({
    ...LessonBaseShape,
    kind: z.literal('capstone'),
    slideSources: z.array(SourcePathSchema),
    project: ProjectSourceSchema,
    completion: z
      .object({
        kind: z.literal('capstone'),
        requiredRuleIds: z.array(IdSchema).min(1),
        requiredViewportIds: z.array(IdSchema).min(1),
      })
      .strict(),
  })
  .strict();

export const LessonSourceSchema = z.discriminatedUnion('kind', [
  StandardLessonSourceSchema,
  GuidedLessonSourceSchema,
  CapstoneLessonSourceSchema,
]);

export const ChapterSourceSchema = z
  .object({
    id: IdSchema,
    sequence: z.number().int().nonnegative(),
    title: TextSchema,
    goal: TextSchema,
    estimatedMinutes: z.number().int().positive(),
    kind: z.enum(['standard', 'guided-project', 'capstone']),
    lessonSources: z.array(SourcePathSchema).min(1),
  })
  .strict();

export const ConceptCatalogSourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    concepts: z.array(ConceptDefinitionSchema).min(1),
  })
  .strict();

const ExpectedTotalsSourceSchema = z
  .object({
    chapters: z.number().int().nonnegative(),
    lessons: z.number().int().nonnegative(),
    conceptSlides: z
      .number()
      .int()
      .nonnegative()
      .describe('学習上必要な追加分割を許可するConcept Slide最低枚数'),
    standardExercises: z.number().int().nonnegative(),
    guidedProjectLessons: z.number().int().nonnegative(),
    capstoneLessons: z.number().int().nonnegative(),
    estimatedMinutes: z.number().int().nonnegative(),
  })
  .strict();

const SupportedDevicesSourceSchema = z
  .object({
    exercise: z.literal('desktop'),
    study: z.array(z.enum(['desktop', 'tablet', 'mobile'])).min(1),
  })
  .strict();

const PhaseSourceSchema = z
  .object({
    id: IdSchema,
    title: TextSchema,
    description: TextSchema,
    chapterSources: z.array(SourcePathSchema).min(1),
  })
  .strict();

export const CourseSourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdSchema,
    title: TextSchema,
    description: TextSchema,
    audience: TextSchema,
    estimatedMinutes: z.number().int().positive(),
    revision: TextSchema,
    runnerId: IdSchema,
    validatorId: IdSchema,
    glossarySource: SourcePathSchema,
    conceptsSource: SourcePathSchema.optional(),
    documentationSources: z.array(SourcePathSchema).default([]),
    authoringSources: z.array(SourcePathSchema).default([]),
    supportedDevices: SupportedDevicesSourceSchema,
    prerequisites: z.array(IdSchema),
    publicationStatus: z.enum(['draft', 'published']),
    expectedTotals: ExpectedTotalsSourceSchema,
    provenanceManifestPath: SourcePathSchema,
    progressMigrations: z.array(ContentProgressMigrationSchema).default([]),
    phases: z.array(PhaseSourceSchema).min(1),
  })
  .strict();

export type AssetSource = z.infer<typeof AssetSourceSchema>;
export type ChapterSource = z.infer<typeof ChapterSourceSchema>;
export type CourseSource = z.infer<typeof CourseSourceSchema>;
export type ExerciseSource = z.infer<typeof ExerciseSourceSchema>;
export type FileSource = z.infer<typeof FileSourceSchema>;
export type FixtureSource = z.infer<typeof FixtureSourceSchema>;
export type LessonSource = z.infer<typeof LessonSourceSchema>;
export type ProjectSource = z.infer<typeof ProjectSourceSchema>;
export type PublicProvenanceManifest = z.infer<typeof PublicProvenanceManifestSchema>;
export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;
export type SlideFrontmatter = z.infer<typeof SlideFrontmatterSchema>;
