import { expect, it } from 'vitest';
import { compileCourse } from '../../scripts/content/compileCourse';
import { buildInventory } from '../../scripts/release/v2/inventory';
import { diagnosticPreparation } from '../e2e/helpers/manifestDiagnosticPlan';

it('selects only the two actual Python practice lessons for synthetic WebKit diagnosis', async () => {
  const inventory = buildInventory([await compileCourse('content/python-practice')]);
  const preparation = diagnosticPreparation(inventory);
  expect(preparation.inventory).toEqual(inventory);
  expect(preparation.plan.targets.map((target) => target.lessonId)).toEqual([
    'python-practice-ch02-l01',
    'python-practice-ch03-l01',
  ]);
  expect(
    preparation.plan.targets.every(
      (target) => target.kind === 'learning-engine' && target.engine === 'webkit',
    ),
  ).toBe(true);
  expect(preparation.plan.parent).toBeNull();
  const course = inventory.courses.find((row) => row.id === 'python-practice')!;
  expect(() =>
    diagnosticPreparation({
      ...inventory,
      courses: [
        {
          ...course,
          lessons: course.lessons.filter((lesson) => lesson.id !== 'python-practice-ch03-l01'),
        },
      ],
    }),
  ).toThrow('Missing diagnostic lesson');
});
