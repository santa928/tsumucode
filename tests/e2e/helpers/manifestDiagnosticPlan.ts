import { InventorySchema, PlanSchema } from '../../../scripts/release/v2/schema';

/** Selects public Source lessons only for diagnosis; this is not a release qualification. */
export function diagnosticPreparation(input: unknown) {
  const inventory = InventorySchema.parse(input);
  const course = inventory.courses.find((item) => item.id === 'python-practice');
  const lessonIds = ['python-practice-ch02-l01', 'python-practice-ch03-l01'];
  if (
    course === undefined ||
    lessonIds.some((id) => !course.lessons.some((lesson) => lesson.id === id))
  )
    throw new Error('Missing diagnostic lesson');
  const plan = PlanSchema.parse({
    schemaVersion: 1,
    inventoryDigest: '0'.repeat(64),
    parent: null,
    publishedCourses: ['python-practice'],
    targets: lessonIds.map((lessonId) => ({
      key: 'diagnostic/' + lessonId,
      kind: 'learning-engine',
      engine: 'webkit',
      courseId: 'python-practice',
      lessonId,
      inputDigest: '0'.repeat(64),
    })),
  });
  return { inventory, plan };
}
