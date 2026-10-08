import { describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from './compileCourse';
import { nextWorkspace } from '../local/next-project-protocol.mjs';
import { CourseManifestSchema } from '../../src/core/content/schema';

/** 新教材のSource・採点目標が異なるWorkspaceへ混ざらないことを確認する。 */
describe('Nextのルーティングと境界教材', () => {
  it('2つの通常Lessonと予測・修正・正負Fixtureを固定契約へ対応させる', async () => {
    const course = await loadAuthoringCourse('content/next');
    const chapter = course.runtime.phases[0]!.chapters[1]!;
    expect(chapter.lessons.map(({ id }) => id)).toEqual(['next-ch02-l01', 'next-ch02-l02']);
    expect(course.runtime.publicationStatus).toBe('draft');
    for (const lesson of chapter.lessons) {
      expect(lesson.kind).toBe('standard');
      expect(lesson.slides).toHaveLength(4);
      expect(
        lesson.slides.some((slide) => slide.blocks.some((block) => block.type === 'prediction')),
      ).toBe(true);
      const exercise = course.exercises.find(({ id }) => id === `${lesson.id}-e01`)!;
      const contract = nextWorkspace(exercise.workspaceId)!;
      expect(
        Object.fromEntries(exercise.files.map(({ path, content }) => [path, content])),
      ).toEqual(contract.files);
      expect(exercise.hints.map(({ level }) => level)).toEqual([1, 2, 3]);
      expect(exercise.validationRules[0]!.assertion).toEqual({
        kind: 'next-page-http',
        goal: contract.goal,
      });
      expect(
        exercise.fixtures.filter(({ expectedStatus }) => expectedStatus === 'pass'),
      ).toHaveLength(2);
      expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'incomplete')).toBe(
        true,
      );
      expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'code-error')).toBe(
        true,
      );
    }
  });

  it('別教材のSourceや採点目標を指定したpayloadを拒否する', async () => {
    const { runtime } = await loadAuthoringCourse('content/next');
    const changed = structuredClone(runtime);
    const chapter = changed.phases[0]!.chapters[1]!;
    const routing = chapter.lessons[0]!.exercises[0]!;
    const boundary = chapter.lessons[1]!.exercises[0]!;
    routing.files = boundary.files;
    expect(CourseManifestSchema.safeParse(changed).success).toBe(false);
    const wrongGoal = structuredClone(runtime);
    wrongGoal.phases[0]!.chapters[1]!.lessons[0]!.exercises[0]!.validationRules[0]!.assertion = {
      kind: 'next-page-http',
      goal: 'server-client-counter',
    };
    expect(CourseManifestSchema.safeParse(wrongGoal).success).toBe(false);
  });
});
