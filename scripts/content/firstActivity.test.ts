import path from 'node:path';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { readYamlFile } from './io';
import { FIRST_ACTIVITY } from '../../src/features/home/firstActivity';

it('Homeの有限導入案内の対象と時間が実教材に一致する', async () => {
  const lesson = await readYamlFile(
    path.resolve(`content/${FIRST_ACTIVITY.courseId}`),
    `chapters/html-css-ch00/lessons/${FIRST_ACTIVITY.lessonId}/lesson.yaml`,
    z.object({
      id: z.string(),
      estimatedMinutes: z.number(),
      prerequisiteLessonIds: z.array(z.string()),
    }),
  );
  expect(lesson).toEqual({
    id: FIRST_ACTIVITY.lessonId,
    estimatedMinutes: FIRST_ACTIVITY.estimatedMinutes,
    prerequisiteLessonIds: [],
  });
});
