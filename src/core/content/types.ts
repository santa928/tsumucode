/** Zod公開契約からCompiler／Runtimeが共有する教材型を一元exportする。 */
import type { z } from 'zod';
import type {
  AssetRefSchema,
  ChapterManifestSchema,
  ContentProgressMigrationSchema,
  CourseCatalogEntrySchema,
  CourseCatalogSchema,
  CourseManifestSchema,
  ExerciseFileSchema,
  ExerciseSchema,
  GlossaryEntrySchema,
  HintSchema,
  HtmlCssRuleAssertionSchema,
  HtmlCssRuleTargetSchema,
  HtmlCssValidationRuleDefinitionSchema,
  LessonSchema,
  PhaseManifestSchema,
  PreviewViewportSchema,
  ProgressMigrationStepSchema,
  RuleAssertionSchema,
  RuleTargetSchema,
  SlideBlockSchema,
  SlideSchema,
  ValidationRuleDefinitionSchema,
} from './schema';

export type CourseCatalog = z.infer<typeof CourseCatalogSchema>;
export type CourseCatalogEntry = z.infer<typeof CourseCatalogEntrySchema>;
export type CourseManifest = z.infer<typeof CourseManifestSchema>;
export type ContentProgressMigration = z.infer<typeof ContentProgressMigrationSchema>;
export type ProgressMigrationStep = z.infer<typeof ProgressMigrationStepSchema>;
export type PhaseManifest = z.infer<typeof PhaseManifestSchema>;
export type ChapterManifest = z.infer<typeof ChapterManifestSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type SlideBlock = z.infer<typeof SlideBlockSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseFile = z.infer<typeof ExerciseFileSchema>;
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
