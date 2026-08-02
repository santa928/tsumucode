import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { readSplitCourseArtifacts } from '../../scripts/content/readSplitCourseArtifacts';
import type { CourseManifest } from '../../src/core/content/types';

let course: CourseManifest;
let readme: string;

beforeAll(async () => {
  const [courseSource, readmeSource] = await Promise.all([
    readSplitCourseArtifacts('public', 'html-css'),
    readFile('README.md', 'utf8'),
  ]);
  course = courseSource;
  readme = readmeSource;
});

describe('HTML/CSS release manifest', () => {
  it('承認済み集計と完全一致する', () => {
    const chapters = course.phases.flatMap((phase) => phase.chapters);
    const lessons = chapters.flatMap((chapter) => chapter.lessons);
    const slides = lessons.flatMap((lesson) => lesson.slides);
    const exercises = lessons.flatMap((lesson) => lesson.exercises);
    expect(chapters).toHaveLength(14);
    expect(lessons).toHaveLength(51);
    expect(slides).toHaveLength(104);
    const conceptKinds = new Set(['concept', 'comparison', 'diagram', 'code']);
    expect(slides.filter((slide) => conceptKinds.has(slide.kind)).length).toBeGreaterThanOrEqual(
      95,
    );
    expect(
      slides.every(({ layout }) =>
        ['explanation', 'code-preview', 'comparison', 'checkpoint'].includes(layout),
      ),
    ).toBe(true);
    expect(exercises.filter((exercise) => exercise.countsTowardStandardExerciseTotal)).toHaveLength(
      45,
    );
    expect(lessons.filter((lesson) => lesson.kind === 'guided-project')).toHaveLength(5);
    expect(lessons.filter((lesson) => lesson.kind === 'capstone')).toHaveLength(1);
    expect(chapters.reduce((sum, chapter) => sum + chapter.estimatedMinutes, 0)).toBe(710);
  });

  it('READMEの教材集計とcoverage gate説明が現在の実体に一致する', () => {
    expect(readme).toMatch(/51レッスン、104スライド/u);
    expect(readme).toMatch(/全104スライド/u);
    expect(readme).toMatch(/Chapter別Vitest契約として`npm run check`へ含まれます/u);
    expect(readme).not.toMatch(/教材再編集が完了するまでは既知の移行Report/u);
  });

  it('全Glossary EntryがLessonから参照され、初出Slideを持つ', () => {
    const lessons = course.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons }) => lessons),
    );
    const refs = new Set(lessons.flatMap(({ glossaryRefs }) => glossaryRefs));
    expect(
      course.glossary.every(
        ({ id, firstSlideId }) =>
          refs.has(id) &&
          lessons.some(({ slides }) => slides.some(({ id: slideId }) => slideId === firstSlideId)),
      ),
    ).toBe(true);
  });
});
