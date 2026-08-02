/** Registry拡張だけで追加できる第2Course相当の非公開Runtime fixture。 */
import { CourseManifestSchema } from '../../src/core/content/schema';
import type { CourseManifest } from '../../src/core/content/types';
import { fixtureCourse } from './course';

const source = structuredClone(fixtureCourse);

export const runtimeFixtureCourse: CourseManifest = CourseManifestSchema.parse({
  ...source,
  id: 'runtime-fixture',
  title: 'Runtime Adapter Fixture',
  description: 'Registry拡張契約を検証する非公開Course',
  publicationStatus: 'draft',
  runnerId: 'fixture-runner',
  validatorId: 'fixture-validator',
  provenanceManifestPath: 'generated/content/courses/runtime-fixture/provenance.json',
  phases: source.phases.map((phase) => ({
    ...phase,
    chapters: phase.chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => ({
        ...lesson,
        exercises: lesson.exercises.map((exercise) => ({
          ...exercise,
          files: exercise.files.map((file) => ({ ...file, language: 'fixture-lang' })),
          validationRules: exercise.validationRules.map((rule) => ({
            ...rule,
            target: { kind: 'fixture-target', token: 'ready' },
            assertion: { kind: 'fixture-assertion', expected: true },
            hintId: exercise.hints.find(({ level }) => level === 3)?.id ?? rule.hintId,
          })),
        })),
      })),
    })),
  })),
});
