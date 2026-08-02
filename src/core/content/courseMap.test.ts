import { describe, expect, it } from 'vitest';
import { fixtureCourse, fixtureCourseIndex } from '../../../tests/fixtures/course';
import { CourseManifestSchema } from './schema';
import type { Exercise, Lesson } from './types';
import { buildCourseMap, lessonStartPath } from './courseMap';

/** Slideを持たないSchema-validな制作Lessonを含むCourseを作る。 */
function makeGuidedProjectCourse() {
  const course = structuredClone(fixtureCourse);
  const chapter = course.phases[0]!.chapters[0]!;
  const standardLesson = chapter.lessons[0]!;
  if (standardLesson.kind !== 'standard') throw new Error('Standard Lesson fixtureがありません');
  const standardExercise = standardLesson.exercises[0]!;
  if (standardExercise.kind !== 'standard') {
    throw new Error('Standard Exercise fixtureがありません');
  }
  standardLesson.nextLessonId = 'project-step';
  const guidedExercise: Extract<Exercise, { kind: 'guided-project' }> = {
    ...standardExercise,
    id: 'project-exercise',
    kind: 'guided-project' as const,
    projectId: 'project-step',
    workspaceId: 'workspace-project-step',
    countsTowardStandardExerciseTotal: false,
    validationRules: standardExercise.validationRules.map((rule) => ({
      ...rule,
      id: 'rule-project-heading',
      hintId: 'hint-project-1',
    })),
    hints: standardExercise.hints.map((hint, index) => ({
      ...hint,
      id: `hint-project-${String(index + 1)}`,
    })),
  };
  const guidedLesson: Extract<Lesson, { kind: 'guided-project' }> = {
    ...standardLesson,
    id: 'project-step',
    kind: 'guided-project',
    title: '小さなページを組み立てる',
    prerequisiteLessonIds: [standardLesson.id],
    slides: [],
    exercises: [guidedExercise],
    project: {
      id: 'project-step',
      brief: [{ type: 'paragraph', text: '見出しのあるページを組み立てます。' }],
      guide: [],
      checklist: [
        {
          id: 'checklist-project-heading',
          label: '見出しを置いた',
          required: true,
          ruleIds: ['rule-project-heading'],
        },
      ],
    },
    completion: {
      kind: 'guided-project',
      requiredChecklistItemIds: ['checklist-project-heading'],
      requiredExerciseIds: ['project-exercise'],
    },
    nextLessonId: undefined,
  };
  course.phases[0]!.chapters.push({
    ...chapter,
    id: 'chapter-project',
    sequence: 1,
    title: '制作で確かめる',
    kind: 'guided-project',
    lessons: [guidedLesson],
  });
  course.estimatedMinutes = 30;
  course.expectedTotals = {
    ...course.expectedTotals,
    chapters: 2,
    lessons: 2,
    guidedProjectLessons: 1,
    estimatedMinutes: 30,
  };

  return CourseManifestSchema.parse(course);
}

describe('buildCourseMap', () => {
  it('Course階層を開始Route付きの表示Modelへ変換する', () => {
    const map = buildCourseMap(fixtureCourse);

    expect(map).toMatchObject({
      id: 'html-css',
      phases: [
        {
          id: 'first-piece',
          title: '最初のピース',
          chapters: [
            {
              id: 'ch00-web-map',
              title: 'Web制作の地図',
              lessons: [
                {
                  id: 'lesson-first-heading',
                  status: 'current',
                  startPath:
                    '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('Lesson本文を持たないCourse Indexから同じ表示Modelを作る', () => {
    expect(buildCourseMap(fixtureCourseIndex)).toMatchObject({
      id: 'html-css',
      phases: [
        {
          chapters: [
            {
              lessons: [
                {
                  id: 'lesson-first-heading',
                  startPath:
                    '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('Phase順とLesson順を保ち、Chapterだけをsequence順へ並べる', () => {
    const sourcePhase = fixtureCourse.phases[0]!;
    const sourceChapter = sourcePhase.chapters[0]!;
    const sourceLesson = sourceChapter.lessons[0]!;
    const secondLesson = {
      ...sourceLesson,
      id: 'lesson-second',
      title: '次のLesson',
      slides: [{ ...sourceLesson.slides[0]!, id: 'slide-second' }],
    };
    const lateChapter = {
      ...sourceChapter,
      id: 'chapter-late',
      sequence: 20,
      lessons: [{ ...sourceLesson, id: 'lesson-late' }],
    };
    const earlyChapter = {
      ...sourceChapter,
      id: 'chapter-early',
      sequence: 10,
      lessons: [sourceLesson, secondLesson],
    };
    const map = buildCourseMap({
      ...fixtureCourse,
      phases: [
        { ...sourcePhase, id: 'phase-first', chapters: [lateChapter, earlyChapter] },
        { ...sourcePhase, id: 'phase-second' },
      ],
    });

    expect(map.phases.map(({ id }) => id)).toEqual(['phase-first', 'phase-second']);
    expect(map.phases[0]!.chapters.map(({ id }) => id)).toEqual(['chapter-early', 'chapter-late']);
    expect(map.phases[0]!.chapters[0]!.lessons.map(({ id }) => id)).toEqual([
      'lesson-first-heading',
      'lesson-second',
    ]);
    expect(
      map.phases.flatMap(({ chapters }) =>
        chapters.flatMap(({ lessons }) => lessons.map(({ status }) => status)),
      ),
    ).toEqual(['current', 'not-started', 'not-started', 'not-started']);
  });
});

describe('lessonStartPath', () => {
  it('SlideがあるLessonは先頭Slideから始める', () => {
    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;

    expect(lessonStartPath(fixtureCourse.id, lesson)).toBe(
      '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    );
  });

  it('Slideがない制作Lessonは先頭Exerciseから始める', () => {
    const course = makeGuidedProjectCourse();
    const projectLesson = course.phases[0]!.chapters[1]!.lessons[0]!;

    expect(lessonStartPath(course.id, projectLesson)).toBe(
      '/courses/html-css/lessons/project-step/exercises/project-exercise',
    );
  });

  it('Guide Slideを持つ制作Lessonも先頭Exerciseから始める', () => {
    const course = makeGuidedProjectCourse();
    const projectLesson = course.phases[0]!.chapters[1]!.lessons[0]!;
    const guide = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.slides[0]!;

    expect(lessonStartPath(course.id, { ...projectLesson, slides: [guide] })).toBe(
      '/courses/html-css/lessons/project-step/exercises/project-exercise',
    );
  });
});
