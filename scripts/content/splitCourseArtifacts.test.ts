import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../tests/fixtures/course';
import { guidedWorkspaceCourse } from '../../tests/fixtures/guidedWorkspaceCourse';
import { stringifyCanonicalJson } from './compileCourse';
import {
  canonicalSha256,
  reconstructCourseManifest,
  splitCourseArtifacts,
} from './splitCourseArtifacts';

describe('splitCourseArtifacts', () => {
  it('分割Artifactを再結合すると元Courseへ完全一致する', () => {
    const split = splitCourseArtifacts(fixtureCourse);
    expect(reconstructCourseManifest(split.index, split.lessons)).toEqual(fixtureCourse);
  });

  it('同じCourseを常に同じcanonical Artifactへ分割する', () => {
    expect(stringifyCanonicalJson(splitCourseArtifacts(fixtureCourse))).toBe(
      stringifyCanonicalJson(splitCourseArtifacts(structuredClone(fixtureCourse))),
    );
  });

  it('Lesson pathとSHAをCourse ID／Lesson IDから決定的に作る', () => {
    const split = splitCourseArtifacts(fixtureCourse);
    const first = split.index.phases[0]!.chapters[0]!.lessons[0]!;
    expect(first.manifestPath).toBe(
      `generated/content/courses/${fixtureCourse.id}/lessons/${first.id}.json`,
    );
    expect(first.manifestSha256).toBe(canonicalSha256(split.lessons[0]));
    expect(first.manifestSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('同じworkspaceのExercise outlineをCourse教材順で保持する', () => {
    const split = splitCourseArtifacts(guidedWorkspaceCourse);
    const exercises = split.index.phases.flatMap((phase) =>
      phase.chapters.flatMap((chapter) => chapter.lessons.flatMap((lesson) => lesson.exercises)),
    );
    expect(exercises.map(({ id }) => id)).toEqual([
      'exercise-guided-step-1',
      'exercise-guided-step-2',
    ]);
    expect(exercises.map(({ workspaceId }) => workspaceId)).toEqual([
      'fixture-guided-workspace',
      'fixture-guided-workspace',
    ]);
  });

  it('Lesson本文の改ざんをSHA不一致として拒否する', () => {
    const split = splitCourseArtifacts(fixtureCourse);
    const tampered = structuredClone(split.lessons);
    tampered[0]!.lesson.title = '改ざんされた題名';
    expect(() => reconstructCourseManifest(split.index, tampered)).toThrow('SHA');
  });

  it('不足したLesson Manifestを拒否する', () => {
    const split = splitCourseArtifacts(fixtureCourse);
    expect(() => reconstructCourseManifest(split.index, [])).toThrow('不足');
  });

  it('Indexにない余分なLesson Manifestを拒否する', () => {
    const split = splitCourseArtifacts(fixtureCourse);
    const extra = structuredClone(split.lessons[0]!);
    extra.lessonId = 'lesson-extra';
    extra.lesson.id = 'lesson-extra';
    expect(() => reconstructCourseManifest(split.index, [...split.lessons, extra])).toThrow('余分');
  });
});
