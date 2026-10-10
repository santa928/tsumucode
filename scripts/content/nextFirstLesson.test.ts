import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { CourseSourceSchema } from './sourceSchema';
import { describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from './compileCourse';
import { NEXT_STARTER_FILES } from '../local/next-project-protocol.mjs';
import { CourseManifestSchema } from '../../src/core/content/schema';

describe('Next最初の通常Lesson', () => {
  it('初期Sourceと固定実行契約を揃え、正負Fixtureと説明を通常Lessonへ接続する', async () => {
    const compiled = await loadAuthoringCourse('content/next');
    const source = CourseSourceSchema.parse(
      parse(await readFile('content/next/course.yaml', 'utf8')),
    );
    expect(compiled.runtime.publicationStatus).toBe(source.publicationStatus);
    expect(compiled.runtime.expectedTotals.standardExercises).toBe(7);
    const lesson = compiled.runtime.phases[0]!.chapters[0]!.lessons[0]!;
    expect(lesson.kind).toBe('standard');
    expect(lesson.slides).toHaveLength(4);
    const exercise = compiled.exercises[0]!;
    expect(Object.fromEntries(exercise.files.map((file) => [file.path, file.content]))).toEqual(
      NEXT_STARTER_FILES,
    );
    expect(exercise.hints).toHaveLength(3);
    expect(exercise.fixtures.map(({ id }) => id)).toEqual([
      'starter',
      'solution',
      'alternative',
      'wrong-page',
      'wrong-query',
      'code-error',
    ]);
    expect(exercise.steps.map(({ file }) => file)).toEqual([
      'app/page.tsx',
      'app/api/question/route.ts',
    ]);
    expect(exercise.validationRules[0]!.assertion).toEqual({
      kind: 'next-page-http',
      goal: 'page-route-query',
    });
  });

  it('未実装のNext Workspaceや任意設定を通常LessonのRuntimeとして受け付けない', async () => {
    const { runtime } = await loadAuthoringCourse('content/next');
    const extraFile = structuredClone(runtime);
    extraFile.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!.files.push({
      path: 'next.config.mjs',
      language: 'javascript',
      content: 'export default {}',
      editable: true,
    });
    expect(CourseManifestSchema.safeParse(extraFile).success).toBe(false);
    const other = structuredClone(runtime);
    other.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!.workspaceId = 'another-next-workspace';
    expect(CourseManifestSchema.safeParse(other).success).toBe(false);
  });
});
