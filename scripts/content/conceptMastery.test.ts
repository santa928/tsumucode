/** Concept習得Timelineの単調性、前提関係、Exercise要求を検証する。 */
import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../tests/fixtures/course';
import type { CourseManifest, Exercise, Lesson, Slide } from '../../src/core/content/types';
import {
  assertCourseMastery,
  collectMasteryDiagnostics,
  collectPromotedConceptIds,
  masteryRank,
} from './conceptMastery';

/** 1 Lesson FixtureのSlideとExerciseを型安全に取り出す。 */
function learningParts(): {
  readonly course: CourseManifest;
  readonly lesson: Extract<Lesson, { kind: 'standard' }>;
  readonly slide: Slide;
  readonly exercise: Extract<Exercise, { kind: 'standard' }>;
} {
  const course = structuredClone(fixtureCourse);
  const lesson = course.phases[0]?.chapters[0]?.lessons[0];
  if (lesson?.kind !== 'standard') throw new Error('Standard Lesson fixtureがありません');
  const slide = lesson.slides[0];
  const exercise = lesson.exercises[0];
  if (slide === undefined || exercise?.kind !== 'standard') {
    throw new Error('Slide／Exercise fixtureがありません');
  }
  return { course, lesson, slide, exercise };
}

describe('Concept mastery timeline', () => {
  it('習得段階を単調比較可能な順序へ変換する', () => {
    expect((['seen', 'read', 'fill', 'transform', 'compose'] as const).map(masteryRank)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it('Exerciseが直前までに教えていないConceptを要求すると診断する', () => {
    const { course, slide, exercise } = learningParts();
    course.concepts = [
      {
        id: 'attribute-selector',
        introducedBySlideId: slide.id,
        prerequisiteConceptIds: [],
        minimumProjectLevel: 'transform',
      },
    ];
    slide.teachesConceptIds = [];
    exercise.requiresConcepts = [{ conceptId: 'attribute-selector', minimumLevel: 'fill' }];

    expect(collectMasteryDiagnostics(course)).toContainEqual(
      expect.objectContaining({
        kind: 'unmet-requirement',
        conceptId: 'attribute-selector',
        actualLevel: undefined,
        requiredLevel: 'read',
      }),
    );
  });

  it('fill以上の初回記述前にread以上のcode-previewを要求する', () => {
    const { course, slide, exercise } = learningParts();
    course.concepts = [
      {
        id: 'html-element',
        introducedBySlideId: slide.id,
        prerequisiteConceptIds: [],
        minimumProjectLevel: 'transform',
      },
    ];
    slide.layout = 'explanation';
    slide.teachesConceptIds = ['html-element'];
    slide.masteryTarget = 'read';
    exercise.requiresConcepts = [{ conceptId: 'html-element', minimumLevel: 'fill' }];

    expect(collectMasteryDiagnostics(course)).toContainEqual(
      expect.objectContaining({
        kind: 'missing-code-preview',
        conceptId: 'html-element',
        requiredLevel: 'fill',
      }),
    );
  });

  it('Standard Exerciseはread済みConceptを実習でfill以上へ引き上げる', () => {
    const { course, slide, exercise } = learningParts();
    course.concepts = [
      {
        id: 'html-element',
        introducedBySlideId: slide.id,
        prerequisiteConceptIds: [],
        minimumProjectLevel: 'transform',
      },
    ];
    slide.layout = 'code-preview';
    slide.teachesConceptIds = ['html-element'];
    slide.masteryTarget = 'read';
    exercise.requiresConcepts = [{ conceptId: 'html-element', minimumLevel: 'transform' }];
    exercise.scaffoldLevel = 'transform';

    expect(collectMasteryDiagnostics(course)).not.toContainEqual(
      expect.objectContaining({
        kind: 'unmet-requirement',
        conceptId: 'html-element',
      }),
    );
    expect(collectMasteryDiagnostics(course)).not.toContainEqual(
      expect.objectContaining({
        kind: 'missing-code-preview',
        conceptId: 'html-element',
      }),
    );
  });

  it('ExerciseのScaffold到達段階が要求到達段階より低い宣言を診断する', () => {
    const { course, slide, exercise } = learningParts();
    course.concepts = [
      {
        id: 'html-element',
        introducedBySlideId: slide.id,
        prerequisiteConceptIds: [],
        minimumProjectLevel: 'transform',
      },
    ];
    slide.layout = 'code-preview';
    slide.teachesConceptIds = ['html-element'];
    slide.masteryTarget = 'read';
    exercise.requiresConcepts = [{ conceptId: 'html-element', minimumLevel: 'transform' }];
    exercise.scaffoldLevel = 'fill';

    expect(collectMasteryDiagnostics(course)).toContainEqual(
      expect.objectContaining({
        kind: 'scaffold-target-mismatch',
        conceptId: 'html-element',
        actualLevel: 'fill',
        requiredLevel: 'transform',
      }),
    );
  });

  it('Exercise成功時は要求Conceptと推移的な前提Conceptを同じ段階へ引き上げる', () => {
    expect(
      collectPromotedConceptIds(
        [
          {
            id: 'html-element',
            introducedBySlideId: 'html-css-ch01-l01-s01',
            prerequisiteConceptIds: [],
            minimumProjectLevel: 'transform',
          },
          {
            id: 'opening-closing-tag',
            introducedBySlideId: 'html-css-ch01-l01-s01',
            prerequisiteConceptIds: ['html-element'],
            minimumProjectLevel: 'transform',
          },
          {
            id: 'heading-h1',
            introducedBySlideId: 'html-css-ch01-l01-s02',
            prerequisiteConceptIds: ['opening-closing-tag'],
            minimumProjectLevel: 'transform',
          },
          {
            id: 'paragraph-p',
            introducedBySlideId: 'html-css-ch01-l01-s02',
            prerequisiteConceptIds: ['opening-closing-tag'],
            minimumProjectLevel: 'transform',
          },
        ],
        ['heading-h1', 'paragraph-p'],
      ),
    ).toEqual(['html-element', 'opening-closing-tag', 'heading-h1', 'paragraph-p']);
  });

  it('Concept prerequisiteの循環を拒否する', () => {
    const { course } = learningParts();
    course.concepts = [
      {
        id: 'concept-a',
        introducedBySlideId: 'slide-html-role',
        prerequisiteConceptIds: ['concept-b'],
        minimumProjectLevel: 'read',
      },
      {
        id: 'concept-b',
        introducedBySlideId: 'slide-html-role',
        prerequisiteConceptIds: ['concept-a'],
        minimumProjectLevel: 'read',
      },
    ];

    expect(() => {
      assertCourseMastery(course);
    }).toThrow(/Concept prerequisiteが循環/u);
  });

  it('Guided ProjectではConceptのminimumProjectLevelまで要求する', () => {
    const { course, lesson, slide, exercise } = learningParts();
    const chapter = course.phases[0]!.chapters[0]!;
    course.concepts = [
      {
        id: 'html-element',
        introducedBySlideId: slide.id,
        prerequisiteConceptIds: [],
        minimumProjectLevel: 'compose',
      },
    ];
    slide.teachesConceptIds = ['html-element'];
    slide.masteryTarget = 'transform';
    exercise.requiresConcepts = [{ conceptId: 'html-element', minimumLevel: 'read' }];
    const guidedExercise: Extract<Exercise, { kind: 'guided-project' }> = {
      ...exercise,
      kind: 'guided-project',
      projectId: 'profile-project',
    };
    const guidedLesson: Extract<Lesson, { kind: 'guided-project' }> = {
      ...lesson,
      kind: 'guided-project',
      exercises: [guidedExercise],
      project: {
        id: 'profile-project',
        brief: [{ type: 'paragraph', text: 'Profileを作ります。' }],
        guide: [],
        checklist: [
          {
            id: 'profile-checklist',
            label: 'HTML構造を作る',
            required: true,
            ruleIds: ['rule-h1-exists'],
          },
        ],
      },
      completion: {
        kind: 'guided-project',
        requiredChecklistItemIds: ['profile-checklist'],
        requiredExerciseIds: [guidedExercise.id],
      },
    };
    chapter.kind = 'guided-project';
    chapter.lessons = [guidedLesson];

    expect(collectMasteryDiagnostics(course)).toContainEqual(
      expect.objectContaining({
        kind: 'unmet-requirement',
        conceptId: 'html-element',
        actualLevel: 'transform',
        requiredLevel: 'compose',
      }),
    );
  });

  it('Slideが一度到達した習得Levelを後退させる宣言を拒否する', () => {
    const { course, lesson, slide } = learningParts();
    course.concepts = [
      {
        id: 'html-element',
        introducedBySlideId: slide.id,
        prerequisiteConceptIds: [],
        minimumProjectLevel: 'transform',
      },
    ];
    slide.teachesConceptIds = ['html-element'];
    slide.masteryTarget = 'transform';
    lesson.slides.push({
      ...structuredClone(slide),
      id: 'slide-html-element-review',
      masteryTarget: 'read',
    });

    expect(() => collectMasteryDiagnostics(course)).toThrow(/習得Levelが後退/u);
  });
});
