/** Authoring YAMLのstrict構造と安全なSource path契約を検証する。 */
import { describe, expect, it } from 'vitest';
import {
  ConceptCatalogSourceSchema,
  CourseSourceSchema,
  ExerciseSourceSchema,
  LessonSourceSchema,
  SlideFrontmatterSchema,
  SourcePathSchema,
} from './sourceSchema';

const validRule = {
  id: 'rule-h1-exists',
  label: 'h1がある',
  required: true,
  group: 'all' as const,
  viewportMode: 'all' as const,
  viewportIds: ['desktop'],
  target: { kind: 'selector' as const, selector: 'h1' },
  assertion: { kind: 'exists' as const },
  feedback: { target: 'h1', expected: '1つある', nextAction: 'h1を追加する' },
  hintId: 'hint-h1-1',
  relatedSlideId: 'slide-html-role',
};

const validHints = [
  { id: 'hint-h1-1', level: 1 as const, title: 'ヒント1', text: 'Tagを確認する' },
  { id: 'hint-h1-2', level: 2 as const, title: 'ヒント2', text: '場所を確認する' },
  { id: 'hint-h1-3', level: 3 as const, title: 'ヒント3', text: '形を確認する' },
];

const validExerciseSource = {
  id: 'exercise-first-heading',
  kind: 'standard' as const,
  workspaceId: 'workspace-first-heading',
  countsTowardStandardExerciseTotal: true,
  title: 'h1を追加する',
  instructionsSource: 'instructions.md',
  files: [{ path: 'index.html', language: 'html', source: 'starter/index.html', editable: true }],
  solutionFiles: [
    { path: 'index.html', language: 'html', source: 'solution/index.html', editable: false },
  ],
  validationRules: [validRule],
  hints: validHints,
  relatedSlideIds: ['slide-html-role'],
  previewViewports: [{ id: 'desktop', width: 1280, height: 720 }],
  assets: [],
  fixtures: [
    {
      id: 'solution',
      expectedStatus: 'pass' as const,
      files: [
        {
          path: 'index.html',
          language: 'html',
          source: 'fixtures/solution.html',
          editable: false,
        },
      ],
      expectedFeedbackRuleIds: [],
    },
  ],
};

const validCourseSource = {
  schemaVersion: 1 as const,
  id: 'html-css',
  title: 'HTML/CSS',
  description: '説明',
  audience: '初心者',
  estimatedMinutes: 15,
  revision: '1',
  runnerId: 'html-css',
  validatorId: 'html-css',
  glossarySource: 'glossary.yaml',
  supportedDevices: { exercise: 'desktop' as const, study: ['desktop' as const] },
  prerequisites: [],
  publicationStatus: 'published' as const,
  documentationSources: [],
  authoringSources: [],
  expectedTotals: {
    chapters: 1,
    lessons: 1,
    conceptSlides: 1,
    standardExercises: 1,
    guidedProjectLessons: 0,
    capstoneLessons: 0,
    estimatedMinutes: 15,
  },
  provenanceManifestPath: 'provenance.yaml',
  progressMigrations: [],
  phases: [
    {
      id: 'phase',
      title: 'Phase',
      description: '説明',
      chapterSources: ['chapters/ch00/chapter.yaml'],
    },
  ],
};

describe('SourcePathSchema', () => {
  it('canonicalなPOSIX相対pathを受理する', () => {
    expect(SourcePathSchema.parse('chapters/ch00/chapter.yaml')).toBe('chapters/ch00/chapter.yaml');
    expect(SourcePathSchema.parse('assets/caf\u00e9.svg')).toBe('assets/caf\u00e9.svg');
  });

  it.each([
    '../outside.yaml',
    'chapters/../outside.yaml',
    './chapter.yaml',
    '/absolute.yaml',
    'C:\\outside.yaml',
    '\\\\server\\share.yaml',
    'https://example.com/chapter.yaml',
    'chapters//chapter.yaml',
    'chapters/ch00/',
    'chapters/%2e%2e/outside.yaml',
    'chapters/%252e%252e/outside.yaml',
    'chapters/%2foutside.yaml',
    'chapter\u0000.yaml',
    'chapter.yaml?raw=1',
    'chapter.yaml#fragment',
    ' chapter.yaml',
    'assets/cafe\u0301.svg',
  ])('曖昧またはRoot外になり得るpathを拒否する: %s', (sourcePath) => {
    expect(SourcePathSchema.safeParse(sourcePath).success).toBe(false);
  });
});

describe('content source schema', () => {
  it('Concept台帳をstrictに受理する', () => {
    expect(
      ConceptCatalogSourceSchema.parse({
        schemaVersion: 1,
        concepts: [
          {
            id: 'html-element',
            introducedBySlideId: 'slide-html-element',
            prerequisiteConceptIds: ['web-page-three-roles'],
            minimumProjectLevel: 'transform',
          },
        ],
      }),
    ).toMatchObject({ concepts: [{ id: 'html-element' }] });
  });

  it('ページ送り教材のMetadataをstrictに受理する', () => {
    expect(
      SlideFrontmatterSchema.parse({
        id: 'slide-html-element',
        title: 'Elementの形',
        kind: 'code',
        layout: 'code-preview',
        teachesConceptIds: ['html-element'],
        masteryTarget: 'read',
        screenBudget: { maxTextCharacters: 240, maxCodeLines: 8, maxVisuals: 1 },
        assets: [],
      }),
    ).toMatchObject({ layout: 'code-preview', masteryTarget: 'read' });
  });

  it('Exercise Stepのfile・target・change・observeを必須にする', () => {
    const result = ExerciseSourceSchema.safeParse({
      ...validExerciseSource,
      requiresConcepts: [{ conceptId: 'html-element', minimumLevel: 'fill' }],
      scaffoldLevel: 'fill',
      steps: [{ id: 'write-heading', file: 'index.html', target: 'body内' }],
    });
    expect(result.success).toBe(false);
  });

  it('strictなCourse sourceを受理する', () => {
    expect(CourseSourceSchema.parse(validCourseSource)).toEqual(validCourseSource);
  });

  it('基盤停止Fixtureを学習者の不正解と分離して受理する', () => {
    const result = ExerciseSourceSchema.parse({
      ...validExerciseSource,
      fixtures: [
        {
          ...validExerciseSource.fixtures[0],
          id: 'runtime-timeout',
          expectedStatus: 'system-error',
        },
      ],
    });

    expect(result.fixtures[0]).toMatchObject({
      id: 'runtime-timeout',
      expectedStatus: 'system-error',
      expectedFeedbackRuleIds: [],
    });
  });

  it('親Directoryへ出るChapter sourceを拒否する', () => {
    const result = CourseSourceSchema.safeParse({
      ...validCourseSource,
      phases: [{ ...validCourseSource.phases[0], chapterSources: ['../chapter.yaml'] }],
    });
    expect(result.success).toBe(false);
  });

  it('未知keyを黙ってstripしない', () => {
    expect(CourseSourceSchema.safeParse({ ...validCourseSource, typo: true }).success).toBe(false);
    expect(ExerciseSourceSchema.safeParse({ ...validExerciseSource, typo: true }).success).toBe(
      false,
    );
  });

  it('Progress Migrationのentityを公開契約と共有する', () => {
    expect(
      CourseSourceSchema.safeParse({
        ...validCourseSource,
        progressMigrations: [
          {
            fromRevision: '0',
            toRevision: '1',
            steps: [{ action: 'preserve', entity: 'unknown', id: 'slide-a' }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('Guided Project ExerciseにprojectIdを要求する', () => {
    const base: Record<string, unknown> = { ...validExerciseSource };
    delete base.kind;
    expect(ExerciseSourceSchema.safeParse({ ...base, kind: 'guided-project' }).success).toBe(false);
  });

  it('Standard ExerciseへprojectIdを許可しない', () => {
    expect(
      ExerciseSourceSchema.safeParse({ ...validExerciseSource, projectId: 'project-a' }).success,
    ).toBe(false);
  });

  it.each([
    [
      'Starter path重複',
      {
        ...validExerciseSource,
        files: [validExerciseSource.files[0], validExerciseSource.files[0]],
      },
    ],
    [
      'Starter editableなし',
      {
        ...validExerciseSource,
        files: [{ ...validExerciseSource.files[0], editable: false }],
      },
    ],
    [
      'Solution editable',
      {
        ...validExerciseSource,
        solutionFiles: [{ ...validExerciseSource.solutionFiles[0], editable: true }],
      },
    ],
    [
      'Solution path/language不一致',
      {
        ...validExerciseSource,
        solutionFiles: [{ ...validExerciseSource.solutionFiles[0], language: 'css' }],
      },
    ],
    [
      'Solution path重複',
      {
        ...validExerciseSource,
        solutionFiles: [validExerciseSource.solutionFiles[0], validExerciseSource.solutionFiles[0]],
      },
    ],
    [
      'Rule ID重複',
      {
        ...validExerciseSource,
        validationRules: [validRule, validRule],
      },
    ],
    [
      'Fixture ID重複',
      {
        ...validExerciseSource,
        fixtures: [validExerciseSource.fixtures[0], validExerciseSource.fixtures[0]],
      },
    ],
    [
      'Fixture editable',
      {
        ...validExerciseSource,
        fixtures: [
          {
            ...validExerciseSource.fixtures[0],
            files: [{ ...validExerciseSource.fixtures[0]!.files[0], editable: true }],
          },
        ],
      },
    ],
    [
      'Fixture path/language不一致',
      {
        ...validExerciseSource,
        fixtures: [
          {
            ...validExerciseSource.fixtures[0],
            files: [{ ...validExerciseSource.fixtures[0]!.files[0], language: 'css' }],
          },
        ],
      },
    ],
    [
      'pass FixtureのFeedback',
      {
        ...validExerciseSource,
        fixtures: [
          { ...validExerciseSource.fixtures[0], expectedFeedbackRuleIds: ['rule-h1-exists'] },
        ],
      },
    ],
    [
      'incomplete Fixtureの空Feedback',
      {
        ...validExerciseSource,
        fixtures: [
          {
            ...validExerciseSource.fixtures[0],
            expectedStatus: 'incomplete',
            expectedFeedbackRuleIds: [],
          },
        ],
      },
    ],
    [
      'Fixtureの未知Rule参照',
      {
        ...validExerciseSource,
        fixtures: [
          { ...validExerciseSource.fixtures[0], expectedFeedbackRuleIds: ['rule-missing'] },
        ],
      },
    ],
    [
      'Fixture Feedback ID重複',
      {
        ...validExerciseSource,
        fixtures: [
          {
            ...validExerciseSource.fixtures[0],
            expectedStatus: 'incomplete' as const,
            expectedFeedbackRuleIds: ['rule-h1-exists', 'rule-h1-exists'],
          },
        ],
      },
    ],
  ])('authoring-only整合違反を拒否する: %s', (_label, source) => {
    expect(ExerciseSourceSchema.safeParse(source).success).toBe(false);
  });

  it('standard LessonへProject sourceを許可しない', () => {
    const standardLesson = {
      id: 'lesson-a',
      kind: 'standard' as const,
      title: 'Lesson',
      goal: 'Goal',
      estimatedMinutes: 15,
      prerequisiteLessonIds: [],
      slideSources: ['slides/a.md'],
      exerciseSources: ['exercises/a/exercise.yaml'],
      reflection: '振り返り',
      glossaryRefs: [],
      completion: {
        kind: 'standard' as const,
        finalSlideId: 'slide-a',
        requiredExerciseIds: ['exercise-a'],
      },
    };
    expect(
      LessonSourceSchema.safeParse({
        ...standardLesson,
        project: {
          id: 'project-a',
          briefSource: 'brief.md',
          guideSources: [],
          checklist: [{ id: 'check-a', label: '確認', required: true, ruleIds: ['rule-a'] }],
        },
      }).success,
    ).toBe(false);
  });

  it('standard LessonにSlide sourceを1件以上要求する', () => {
    expect(
      LessonSourceSchema.safeParse({
        id: 'lesson-a',
        kind: 'standard',
        title: 'Lesson',
        goal: 'Goal',
        estimatedMinutes: 15,
        prerequisiteLessonIds: [],
        slideSources: [],
        exerciseSources: ['exercises/a/exercise.yaml'],
        reflection: '振り返り',
        glossaryRefs: [],
        completion: {
          kind: 'standard',
          finalSlideId: 'slide-a',
          requiredExerciseIds: ['exercise-a'],
        },
      }).success,
    ).toBe(false);
  });
});
