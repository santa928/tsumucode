/** Zod公開契約からCompiler／Runtimeが共有する教材型を一元exportする。 */
import type { z } from 'zod';
import type {
  CourseCatalogEntryV3Schema,
  CourseCatalogV3Schema,
  CourseIndexSchema,
  LessonManifestSchema,
  LessonOutlineSchema,
} from './deliverySchema';
import type {
  AssetRefSchema,
  ChapterManifestSchema,
  ConceptDefinitionSchema,
  ConceptRequirementSchema,
  ContentProgressMigrationSchema,
  CourseCatalogLessonStartSchema,
  CourseManifestSchema,
  ExerciseFileSchema,
  ExerciseSchema,
  ExerciseStepSchema,
  GlossaryEntrySchema,
  HintSchema,
  HtmlCssRuleAssertionSchema,
  HtmlCssRuleTargetSchema,
  HtmlCssValidationRuleDefinitionSchema,
  LessonSchema,
  LearningPathDefinitionSchema,
  LearningPathStepSchema,
  LessonStartTargetSchema,
  MasteryLevelSchema,
  PhaseManifestSchema,
  PreviewViewportSchema,
  ProgressMigrationStepSchema,
  RuleAssertionSchema,
  RuleTargetSchema,
  SlideLayoutSchema,
  SlideBlockSchema,
  SlideSchema,
  ValidationRuleDefinitionSchema,
} from './schema';

export type CourseCatalogV3 = z.infer<typeof CourseCatalogV3Schema>;
export type CourseCatalogEntryV3 = z.infer<typeof CourseCatalogEntryV3Schema>;
export type CourseCatalog = CourseCatalogV3;
export type CourseCatalogEntry = CourseCatalogEntryV3;
export type CourseIndex = z.infer<typeof CourseIndexSchema>;
export type LessonManifest = z.infer<typeof LessonManifestSchema>;
export type LessonOutline = z.infer<typeof LessonOutlineSchema>;
export type CourseCatalogLessonStart = z.infer<typeof CourseCatalogLessonStartSchema>;
export type LearningPathDefinition = z.infer<typeof LearningPathDefinitionSchema>;
export type LearningPathStep = z.infer<typeof LearningPathStepSchema>;
export type LessonStartTarget = z.infer<typeof LessonStartTargetSchema>;
export type CourseManifest = z.infer<typeof CourseManifestSchema>;
export type ContentProgressMigration = z.infer<typeof ContentProgressMigrationSchema>;
export type ProgressMigrationStep = z.infer<typeof ProgressMigrationStepSchema>;
export type PhaseManifest = z.infer<typeof PhaseManifestSchema>;
export type ChapterManifest = z.infer<typeof ChapterManifestSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type SlideBlock = z.infer<typeof SlideBlockSchema>;
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;
export type MasteryLevel = z.infer<typeof MasteryLevelSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseFile = z.infer<typeof ExerciseFileSchema>;
export type ExerciseStep = z.infer<typeof ExerciseStepSchema>;
export type ConceptDefinition = z.infer<typeof ConceptDefinitionSchema>;
export type ConceptRequirement = z.infer<typeof ConceptRequirementSchema>;
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
export type Hint = z.infer<typeof HintSchema>;
export type AssetRef = z.infer<typeof AssetRefSchema>;
export type PreviewViewport = z.infer<typeof PreviewViewportSchema>;
export type RuleTarget = z.infer<typeof RuleTargetSchema>;
export type RuleAssertion = z.infer<typeof RuleAssertionSchema>;
export type ValidationRuleDefinition = z.infer<typeof ValidationRuleDefinitionSchema>;
export type HtmlCssRuleTarget = z.infer<typeof HtmlCssRuleTargetSchema>;
export type HtmlCssRuleAssertion = z.infer<typeof HtmlCssRuleAssertionSchema>;
export type HtmlCssValidationRuleDefinition = z.infer<typeof HtmlCssValidationRuleDefinitionSchema>;
