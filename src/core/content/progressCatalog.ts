/** 本文を公開せず、既知教材の保存／Import契約を保持する。 */
import { z } from 'zod';
import { CourseEntityIdsSchema } from './deliverySchema';
import { ContentProgressMigrationSchema, IdSchema, NonEmptyTextSchema } from './schema';
import type { CourseMigrationDescriptor } from '../persistence/contentProgressMigration';
import type { CourseIndex } from './types';

const DescriptorSchema = z
  .object({
    id: IdSchema,
    revision: NonEmptyTextSchema,
    progressMigrations: z.array(ContentProgressMigrationSchema),
    entityIds: CourseEntityIdsSchema,
    phases: z.array(
      z
        .object({
          chapters: z.array(
            z
              .object({
                lessons: z.array(
                  z
                    .object({
                      id: IdSchema,
                      exercises: z.array(z.object({ id: IdSchema }).strict()),
                    })
                    .strict(),
                ),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export const ProgressCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    courses: z.array(DescriptorSchema).min(1),
  })
  .strict()
  .superRefine(({ courses }, context) => {
    if (new Set(courses.map(({ id }) => id)).size !== courses.length)
      context.addIssue({ code: 'custom', message: 'Duplicate progress course' });
    for (const course of courses) {
      const lessons = course.phases.flatMap(({ chapters }) =>
        chapters.flatMap(({ lessons }) => lessons),
      );
      const lessonIds = lessons.map(({ id }) => id);
      const exerciseIds = lessons.flatMap(({ exercises }) => exercises.map(({ id }) => id));
      for (const [observed, expected] of [
        [lessonIds, course.entityIds.lesson],
        [exerciseIds, course.entityIds.exercise],
      ] as const) {
        if (
          new Set(observed).size !== observed.length ||
          JSON.stringify(observed) !== JSON.stringify(expected)
        )
          context.addIssue({
            code: 'custom',
            message: 'Progress identities differ from course entities',
          });
      }
    }
  });
export type ProgressCatalog = z.infer<typeof ProgressCatalogSchema>;
export function projectProgressDescriptor(index: CourseIndex): CourseMigrationDescriptor {
  return DescriptorSchema.parse({
    id: index.id,
    revision: index.revision,
    progressMigrations: index.progressMigrations,
    entityIds: index.entityIds,
    phases: index.phases.map(({ chapters }) => ({
      chapters: chapters.map(({ lessons }) => ({
        lessons: lessons.map(({ id, exercises }) => ({
          id,
          exercises: exercises.map(({ id }) => ({ id })),
        })),
      })),
    })),
  });
}
