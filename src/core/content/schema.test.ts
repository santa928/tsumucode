/** 公開Course契約のfail-closed境界、参照整合、移行chainを固定する。 */
import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../../tests/fixtures/course';
import {
  AssetRefSchema,
  CourseManifestSchema,
  ExerciseSchema,
  JavaScriptValidationRuleDefinitionSchema,
  PreviewViewportSchema,
  SlideSchema,
} from './schema';
import type {
  ContentProgressMigration,
  CourseManifest,
  Exercise,
  Lesson,
  PreviewViewport,
} from './types';

type StandardLesson = Extract<Lesson, { kind: 'standard' }>;
type GuidedLesson = Extract<Lesson, { kind: 'guided-project' }>;
type CapstoneLesson = Extract<Lesson, { kind: 'capstone' }>;
type StandardExercise = Extract<Exercise, { kind: 'standard' }>;
type GuidedExercise = Extract<Exercise, { kind: 'guided-project' }>;
type CapstoneExercise = Extract<Exercise, { kind: 'capstone' }>;

/** Testごとに独立して壊せるCourse cloneを返す。 */
function cloneCourse(): CourseManifest {
  return structuredClone(fixtureCourse);
}

/** 最小Fixtureの先頭Standard Lessonを安全に取り出す。 */
function firstStandardLesson(course: CourseManifest): StandardLesson {
  const lesson = course.phases[0]?.chapters[0]?.lessons[0];
  if (lesson?.kind !== 'standard') throw new Error('Standard Lesson fixtureがありません');
  return lesson;
}

/** Standard Lessonの先頭Exerciseを安全に取り出す。 */
function firstStandardExercise(lesson: StandardLesson): StandardExercise {
  const exercise = lesson.exercises[0];
  if (exercise?.kind !== 'standard') throw new Error('Standard Exercise fixtureがありません');
  return exercise;
}

/** Course Schemaの失敗messageとpathを1つの検証可能な文字列へ畳む。 */
function expectCourseIssue(input: unknown, expected: string | RegExp, expectedPath?: string): void {
  const result = CourseManifestSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Course Schemaが不正入力を受理しました');
  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  if (typeof expected === 'string') expect(issues).toContain(expected);
  else expect(issues).toMatch(expected);
  if (expectedPath !== undefined) {
    expect(result.error.issues.some((issue) => issue.path.join('.') === expectedPath)).toBe(true);
  }
}

/** 全IDと宣言集計を整えた2 Lesson Courseを作る。 */
function makeTwoLessonCourse(): CourseManifest {
  const course = cloneCourse();
  const chapter = course.phases[0]!.chapters[0]!;
  const first = firstStandardLesson(course);
  const second = structuredClone(first);
  const secondSlide = second.slides[0]!;
  const secondExercise = firstStandardExercise(second);
  const secondRule = secondExercise.validationRules[0]!;

  first.nextLessonId = 'lesson-second-heading';
  second.id = 'lesson-second-heading';
  second.title = 'もう1つ見出しを置く';
  second.prerequisiteLessonIds = [first.id];
  delete second.nextLessonId;

  secondSlide.id = 'slide-second-heading';
  secondSlide.title = '2つ目の見出し';
  secondExercise.id = 'exercise-second-heading';
  secondExercise.workspaceId = 'workspace-second-heading';
  secondExercise.title = '2つ目の見出しを追加する';
  secondExercise.relatedSlideIds = [secondSlide.id];
  secondRule.id = 'rule-second-heading';
  secondRule.hintId = 'hint-second-1';
  secondRule.relatedSlideId = secondSlide.id;
  secondExercise.hints[0]!.id = 'hint-second-1';
  secondExercise.hints[1]!.id = 'hint-second-2';
  secondExercise.hints[2]!.id = 'hint-second-3';
  for (const hint of secondExercise.hints) hint.relatedSlideId = secondSlide.id;
  second.completion.finalSlideId = secondSlide.id;
  second.completion.requiredExerciseIds = [secondExercise.id];

  chapter.lessons.push(second);
  chapter.estimatedMinutes = 30;
  course.estimatedMinutes = 30;
  course.expectedTotals = {
    chapters: 1,
    lessons: 2,
    conceptSlides: 2,
    standardExercises: 2,
    guidedProjectLessons: 0,
    capstoneLessons: 0,
    estimatedMinutes: 30,
  };
  return course;
}

/** 同じproject/workspaceを共有する2工程のGuided Project Courseを作る。 */
function makeGuidedProjectCourse(): CourseManifest {
  const course = makeTwoLessonCourse();
  const chapter = course.phases[0]!.chapters[0]!;
  chapter.kind = 'guided-project';

  const toGuided = (lesson: StandardLesson, checklistId: string): GuidedLesson => {
    const standardExercise = firstStandardExercise(lesson);
    const guidedExercise: GuidedExercise = {
      ...standardExercise,
      kind: 'guided-project',
      projectId: 'profile-project',
      workspaceId: 'profile-workspace',
      countsTowardStandardExerciseTotal: false,
    };
    const requirementId =
      guidedExercise.validationRules[0]!.groupId ?? guidedExercise.validationRules[0]!.id;
    return {
      ...lesson,
      kind: 'guided-project',
      exercises: [guidedExercise],
      project: {
        id: 'profile-project',
        brief: [{ type: 'paragraph', text: 'Profile Siteの設計図を作ります。' }],
        guide: [],
        checklist: [
          {
            id: checklistId,
            label: '工程の必須条件を満たした',
            required: true,
            ruleIds: [requirementId],
          },
        ],
      },
      completion: {
        kind: 'guided-project',
        requiredChecklistItemIds: [checklistId],
        requiredExerciseIds: [guidedExercise.id],
      },
    };
  };

  chapter.lessons = [
    toGuided(chapter.lessons[0] as StandardLesson, 'checklist-profile-first'),
    toGuided(chapter.lessons[1] as StandardLesson, 'checklist-profile-second'),
  ];
  course.expectedTotals.standardExercises = 0;
  course.expectedTotals.guidedProjectLessons = 2;
  return course;
}

/** 必須desktop/mobileを持つ最小Capstone Courseを作る。 */
function makeCapstoneCourse(coverMobile: boolean): CourseManifest {
  const course = cloneCourse();
  const chapter = course.phases[0]!.chapters[0]!;
  const standardLesson = firstStandardLesson(course);
  const standardExercise = firstStandardExercise(standardLesson);
  const rule = structuredClone(standardExercise.validationRules[0]!);
  rule.viewportIds = coverMobile ? ['desktop', 'mobile'] : ['desktop'];
  rule.viewportMode = 'all';
  const capstoneExercise: CapstoneExercise = {
    ...standardExercise,
    kind: 'capstone',
    projectId: 'capstone-project',
    workspaceId: 'capstone-workspace',
    countsTowardStandardExerciseTotal: false,
    validationRules: [rule],
    previewViewports: [
      ...standardExercise.previewViewports,
      { id: 'mobile', width: 390, height: 844 },
    ],
  };
  const requirementId = rule.groupId ?? rule.id;
  const capstoneLesson: CapstoneLesson = {
    ...standardLesson,
    kind: 'capstone',
    exercises: [capstoneExercise],
    project: {
      id: 'capstone-project',
      brief: [{ type: 'paragraph', text: '完成作品を組み立てます。' }],
      guide: [],
      checklist: [
        {
          id: 'capstone-checklist',
          label: '必須条件を満たした',
          required: true,
          ruleIds: [requirementId],
        },
      ],
    },
    completion: {
      kind: 'capstone',
      requiredRuleIds: [requirementId],
      requiredViewportIds: ['desktop', 'mobile'],
    },
  };
  chapter.kind = 'capstone';
  chapter.lessons = [capstoneLesson];
  course.expectedTotals.standardExercises = 0;
  course.expectedTotals.capstoneLessons = 1;
  return course;
}

/** 進捗移行をCourseへ設定し、配列literalの型を一箇所で固定する。 */
function withMigrations(
  revision: string,
  migrations: readonly ContentProgressMigration[],
): CourseManifest {
  const course = cloneCourse();
  course.revision = revision;
  course.progressMigrations = [...migrations];
  return course;
}

/** PreviewViewportのSchema出力が型上もreadonlyであることをcompile時に固定する。 */
function assertViewportReadonly(viewport: PreviewViewport): void {
  // @ts-expect-error PreviewViewportはCourse内部でもreadonlyである。
  viewport.width = 390;
}
void assertViewportReadonly;

describe('CourseManifestSchema 公開境界', () => {
  it('Interaction ScenarioをJavaScript DOM Exerciseの公開契約として受理する', () => {
    const course = cloneCourse();
    course.runnerId = 'javascript';
    course.validatorId = 'javascript';
    const exercise = firstStandardExercise(firstStandardLesson(course));
    exercise.files.push({
      path: 'script.js',
      language: 'javascript',
      content: "document.querySelector('#result').textContent = '1';",
      editable: true,
    });
    Object.assign(exercise, {
      runtime: {
        kind: 'javascript',
        entryFile: 'script.js',
        sourceType: 'script',
        capabilityProfile: 'dom',
        primaryOutput: 'preview',
      },
      interactionScenarios: [
        {
          id: 'answer-correctly',
          label: '正解を選んで結果を確認する',
          actions: [{ id: 'choose', kind: 'click', selector: '[data-answer="a"]' }],
          checkpoints: [
            {
              id: 'score-updated',
              afterActionId: 'choose',
              expectations: [
                { id: 'score-text', kind: 'selector-text', selector: '#score', equals: '1' },
              ],
            },
          ],
        },
      ],
    });
    exercise.validationRules.push({
      ...exercise.validationRules[0]!,
      id: 'script-updates-result',
      target: { kind: 'javascript-source', file: 'script.js' },
      assertion: {
        kind: 'query-selector-text-content-assignment',
        selector: '#result',
        expected: '1',
      },
    });

    const parsed = CourseManifestSchema.parse(course);

    expect(
      firstStandardExercise(firstStandardLesson(parsed)).interactionScenarios?.[0]?.checkpoints[0]
        ?.expectations,
    ).toEqual([{ id: 'score-text', kind: 'selector-text', selector: '#score', equals: '1' }]);
  });

  it.each(['core', 'modules'])(
    'Interaction ScenarioをJavaScript %s profileで拒否する',
    (profile) => {
      const course = cloneCourse();
      const exercise = firstStandardExercise(firstStandardLesson(course));
      Object.assign(exercise, {
        runtime: {
          kind: 'javascript',
          entryFile: 'index.html',
          sourceType: 'script',
          capabilityProfile: profile,
          primaryOutput: 'preview',
        },
        interactionScenarios: [
          {
            id: 'answer-correctly',
            label: '正解を選ぶ',
            actions: [{ id: 'choose', kind: 'click', selector: '#answer' }],
            checkpoints: [
              {
                id: 'result-updated',
                afterActionId: 'choose',
                expectations: [{ id: 'result', kind: 'selector-exists', selector: '#result' }],
              },
            ],
          },
        ],
      });

      expectCourseIssue(
        course,
        'Interaction Scenarioはdom、async、project profileで指定してください',
      );
    },
  );

  it('ページ送りSlideのLayout・習得段階・画面予算を受理する', () => {
    const slide = structuredClone(firstStandardLesson(cloneCourse()).slides[0]!);
    Object.assign(slide, {
      layout: 'code-preview',
      teachesConceptIds: ['html-element'],
      masteryTarget: 'read',
      screenBudget: { maxTextCharacters: 240, maxCodeLines: 8, maxVisuals: 1 },
    });

    expect(SlideSchema.safeParse(slide).success).toBe(true);
  });

  it('公開Slideでページ送りMetadataを必須にする', () => {
    const slide = structuredClone(firstStandardLesson(cloneCourse()).slides[0]!);
    Reflect.deleteProperty(slide, 'layout');
    expect(SlideSchema.safeParse(slide).success).toBe(false);
  });

  it('公開ExerciseでConcept要件と実行可能なStepを必須にする', () => {
    const exercise = structuredClone(firstStandardExercise(firstStandardLesson(cloneCourse())));
    Object.assign(exercise, {
      requiresConcepts: [{ conceptId: 'html-element', minimumLevel: 'fill' }],
      scaffoldLevel: 'fill',
      steps: [
        {
          id: 'write-heading',
          file: 'index.html',
          target: 'main要素の内側',
          starterAnchor: '<main></main>',
          change: 'h1要素を追加する',
          observe: '見出しがPreviewへ表示される',
          requiresConceptIds: ['html-element'],
          validationRuleIds: ['rule-h1-exists'],
        },
      ],
    });

    expect(ExerciseSchema.safeParse(exercise).success).toBe(true);
  });

  it('公開ExerciseでConcept要件とStepを省略できない', () => {
    const exercise = structuredClone(firstStandardExercise(firstStandardLesson(cloneCourse())));
    Reflect.deleteProperty(exercise, 'steps');
    expect(ExerciseSchema.safeParse(exercise).success).toBe(false);
  });

  it('公開ExerciseでstrictなJavaScript Runtime設定を保持する', () => {
    const exercise = structuredClone(firstStandardExercise(firstStandardLesson(cloneCourse())));
    const runtime = {
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      capabilityProfile: 'core',
      primaryOutput: 'console',
    } as const;
    Object.assign(exercise, { runtime });

    const parsed = ExerciseSchema.parse(exercise);

    expect(parsed.runtime).toEqual(runtime);
  });

  it('正しい公開Courseを変形せず受理する', () => {
    expect(CourseManifestSchema.parse(fixtureCourse)).toEqual(fixtureCourse);
  });

  it('PreviewViewport outputを型とruntimeの両方でreadonlyにする', () => {
    const viewport = PreviewViewportSchema.parse({ id: 'mobile', width: 390, height: 844 });
    expect(Object.isFrozen(viewport)).toBe(true);
  });

  it.each(['solutionFiles', 'fixtures'] as const)(
    '公開Exerciseのauthoring-only field %sをstripせず拒否する',
    (field) => {
      const course = cloneCourse();
      Object.assign(firstStandardExercise(firstStandardLesson(course)), { [field]: [] });
      expectCourseIssue(course, /Unrecognized key/);
    },
  );

  it('公開ExerciseのSource参照fieldを拒否する', () => {
    const course = cloneCourse();
    Object.assign(firstStandardExercise(firstStandardLesson(course)), {
      instructionsSource: 'instructions.md',
    });
    expectCourseIssue(course, /Unrecognized key/);
  });

  it('公開payloadのviewportModeとprogressMigrations欠落を補完せず拒否する', () => {
    const missingViewportMode = cloneCourse();
    Reflect.deleteProperty(
      firstStandardExercise(firstStandardLesson(missingViewportMode)).validationRules[0]!,
      'viewportMode',
    );
    expect(CourseManifestSchema.safeParse(missingViewportMode).success).toBe(false);

    const missingMigrations = cloneCourse();
    Reflect.deleteProperty(missingMigrations, 'progressMigrations');
    expect(CourseManifestSchema.safeParse(missingMigrations).success).toBe(false);
  });

  it.each([
    ['Course root', (course: CourseManifest) => Object.assign(course, { titlle: 'typo' })],
    [
      'Slide block',
      (course: CourseManifest) =>
        Object.assign(firstStandardLesson(course).slides[0]!.blocks[0]!, { colour: 'red' }),
    ],
    [
      'Rule feedback',
      (course: CourseManifest) =>
        Object.assign(
          firstStandardExercise(firstStandardLesson(course)).validationRules[0]!.feedback,
          { actual: 'unknown' },
        ),
    ],
    [
      'completion',
      (course: CourseManifest) =>
        Object.assign(firstStandardLesson(course).completion, { done: true }),
    ],
  ])('%sの未知fieldを拒否する', (_label, mutate) => {
    const course = cloneCourse();
    mutate(course);
    expectCourseIssue(course, /Unrecognized key/);
  });

  it('Generic Adapter payloadだけは未知fieldを保持する', () => {
    const course = cloneCourse();
    course.runnerId = 'custom-runner';
    course.validatorId = 'ast-validator';
    const exercise = firstStandardExercise(firstStandardLesson(course));
    exercise.files[0]!.language = 'custom-language';
    const rule = exercise.validationRules[0]!;
    rule.target = { kind: 'ast-node', nodeType: 'CallExpression', minimumChildren: 1 };
    rule.assertion = { kind: 'returns-type', typeName: 'Promise<string>' };

    const parsed = CourseManifestSchema.parse(course);
    const parsedRule = parsed.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!.validationRules[0]!;
    expect(parsedRule.target).toEqual(rule.target);
    expect(parsedRule.assertion).toEqual(rule.assertion);
    expect(parsed.runnerId).toBe('custom-runner');
    expect(parsed.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!.files[0]!.language).toBe(
      'custom-language',
    );

    const leaked = cloneCourse();
    leaked.validatorId = 'ast-validator';
    firstStandardExercise(firstStandardLesson(leaked)).validationRules[0]!.target = {
      kind: 'ast-node',
      options: { fixtures: [] },
    };
    expectCourseIssue(leaked, 'Adapter payloadへauthoring-only fieldを含められません');
  });

  it('JavaScript ValidatorのSource Ruleだけをstrictな専用契約で受理する', () => {
    const course = cloneCourse();
    course.runnerId = 'javascript';
    course.validatorId = 'javascript';
    const exercise = firstStandardExercise(firstStandardLesson(course));
    exercise.files.push({
      path: 'script.js',
      language: 'javascript',
      content: "document.querySelector('#message').textContent = '変更後';",
      editable: true,
    });
    Object.assign(exercise, {
      runtime: {
        kind: 'javascript',
        entryFile: 'script.js',
        sourceType: 'script',
        capabilityProfile: 'core',
        primaryOutput: 'preview',
      },
    });
    const sourceRule = {
      ...exercise.validationRules[0]!,
      target: { kind: 'javascript-source', file: 'script.js' },
      assertion: {
        kind: 'query-selector-text-content-assignment',
        selector: '#message',
        expected: '変更後',
      },
    };
    exercise.validationRules = [sourceRule];

    expect(JavaScriptValidationRuleDefinitionSchema.parse(sourceRule)).toEqual(sourceRule);
    expect(CourseManifestSchema.safeParse(course).success).toBe(true);

    const unknown = structuredClone(course);
    Object.assign(
      firstStandardExercise(firstStandardLesson(unknown)).validationRules[0]!.assertion,
      { solutionFiles: [] },
    );
    expectCourseIssue(unknown, 'JavaScript Validator Ruleの形式が不正です');
  });

  it.each([
    { kind: 'collection', collectionKind: 'array', entryCount: 3 },
    { kind: 'collection-access', accessKind: 'at' },
    { kind: 'destructuring', patternKind: 'object', bindingCount: 2 },
    {
      kind: 'collection-transform',
      method: 'reduce',
      callbackParameterCount: 2,
    },
    { kind: 'immutable-update', updateKind: 'array-map' },
    { kind: 'module-boundary', boundaryKind: 'import', name: 'questions' },
    { kind: 'error-flow', flowKind: 'throw' },
  ])('JavaScript Data Source Fact $kindをstrict Ruleとして受理する', (fact) => {
    const rule = {
      ...firstStandardExercise(firstStandardLesson(cloneCourse())).validationRules[0]!,
      target: { kind: 'javascript-source', file: 'script.js' },
      assertion: { kind: 'javascript-source-fact', fact },
    };

    expect(JavaScriptValidationRuleDefinitionSchema.safeParse(rule).success).toBe(true);
  });

  it.each([
    { kind: 'collection', collectionKind: 'array', entryCount: 65 },
    { kind: 'destructuring', patternKind: 'object', bindingCount: -1 },
    { kind: 'collection-transform', method: 'sort', callbackParameterCount: 1 },
    { kind: 'module-boundary', boundaryKind: 'export', name: '' },
    { kind: 'error-flow', flowKind: 'finally', unexpected: true },
  ])('JavaScript Data Source Factのbounded union外を拒否する: $kind', (fact) => {
    const rule = {
      ...firstStandardExercise(firstStandardLesson(cloneCourse())).validationRules[0]!,
      target: { kind: 'javascript-source', file: 'script.js' },
      assertion: { kind: 'javascript-source-fact', fact },
    };

    expect(JavaScriptValidationRuleDefinitionSchema.safeParse(rule).success).toBe(false);
  });

  it('JavaScript RunnerのCourseへRuntime設定を必須にする', () => {
    const course = cloneCourse();
    course.runnerId = 'javascript';

    expectCourseIssue(course, 'JavaScript ExerciseにはRuntime設定が必要です');
  });

  it('HTML/CSS RunnerのCourseへJavaScript Runtime設定を許可しない', () => {
    const course = cloneCourse();
    Object.assign(firstStandardExercise(firstStandardLesson(course)), {
      runtime: {
        kind: 'javascript',
        entryFile: 'index.html',
        sourceType: 'script',
        capabilityProfile: 'core',
        primaryOutput: 'preview',
      },
    });

    expectCourseIssue(course, 'Course RunnerとRuntime設定が一致しません');
  });
});

describe('CourseManifestSchema canonical path', () => {
  it.each([
    '/absolute.json',
    'https://example.com/course.json',
    '//example.com/course.json',
    '../course.json',
    '%2e%2e/course.json',
    '%252e%252e/course.json',
    'safe/%2f/course.json',
    'safe/%5c/course.json',
    'safe\\course.json',
    'safe/course.json?raw=1',
    'safe/course.json#fragment',
    'safe/%course.json',
    'safe/%00course.json',
    'safe//course.json',
    'safe/./course.json',
    ' safe/course.json',
  ])('危険なPublic pathを拒否する: %s', (path) => {
    const course = cloneCourse();
    course.provenanceManifestPath = path;
    expectCourseIssue(course, '安全な相対Path');
  });

  it('安全な相対path、先頭./、percent encoded日本語を受理する', () => {
    for (const path of [
      'generated/content/course.json',
      './generated/content/course.json',
      'generated/%E6%95%99%E6%9D%90/course.json',
    ]) {
      const course = cloneCourse();
      course.provenanceManifestPath = path;
      expect(CourseManifestSchema.safeParse(course).success).toBe(true);
    }
  });

  it('FileとAssetも同じcanonical path契約を使う', () => {
    const fileCourse = cloneCourse();
    firstStandardExercise(firstStandardLesson(fileCourse)).files[0]!.path = '%2e%2e/index.html';
    expectCourseIssue(fileCourse, '安全な相対Path');

    const assetCourse = cloneCourse();
    firstStandardLesson(assetCourse).slides[0]!.assets.push({
      id: 'unsafe-asset',
      path: 'assets/%5c/secret.png',
      mediaType: 'image',
      alt: '説明画像',
      provenanceId: 'unsafe-asset-provenance',
    });
    expectCourseIssue(assetCourse, '安全な相対Path');
  });
});

describe('CourseManifestSchema ID、参照、workspace', () => {
  it('同じentityのCourse-global重複IDを拒否し、別entityの同名は許可する', () => {
    const duplicate = cloneCourse();
    const lesson = firstStandardLesson(duplicate);
    lesson.slides.push(structuredClone(lesson.slides[0]!));
    expectCourseIssue(duplicate, '重複ID: slide:slide-html-role');

    const separateNamespaces = cloneCourse();
    separateNamespaces.phases[0]!.id = separateNamespaces.phases[0]!.chapters[0]!.id;
    expect(CourseManifestSchema.safeParse(separateNamespaces).success).toBe(true);
  });

  it('RuleとHint IDをCourse-globalに一意化する', () => {
    const duplicateRule = makeTwoLessonCourse();
    const lessons = duplicateRule.phases[0]!.chapters[0]!.lessons;
    lessons[1]!.exercises[0]!.validationRules[0]!.id =
      lessons[0]!.exercises[0]!.validationRules[0]!.id;
    expectCourseIssue(duplicateRule, '重複ID: rule:rule-h1-exists');

    const duplicateHint = makeTwoLessonCourse();
    const hintLessons = duplicateHint.phases[0]!.chapters[0]!.lessons;
    hintLessons[1]!.exercises[0]!.hints[1]!.id = hintLessons[0]!.exercises[0]!.hints[1]!.id;
    expectCourseIssue(duplicateHint, '重複ID: hint:hint-h1-2');
  });

  it('同じRule Groupを同じExercise内だけで共有できる', () => {
    const valid = cloneCourse();
    const rules = firstStandardExercise(firstStandardLesson(valid)).validationRules;
    rules[0]!.groupId = 'heading-method';
    rules[0]!.group = 'any';
    const alternative = structuredClone(rules[0]!);
    alternative.id = 'rule-heading-alternative';
    rules.push(alternative);
    expect(CourseManifestSchema.safeParse(valid).success).toBe(true);

    const invalid = makeTwoLessonCourse();
    const invalidLessons = invalid.phases[0]!.chapters[0]!.lessons;
    invalidLessons[0]!.exercises[0]!.validationRules[0]!.groupId = 'shared-across-exercise';
    invalidLessons[1]!.exercises[0]!.validationRules[0]!.groupId = 'shared-across-exercise';
    expectCourseIssue(invalid, 'Rule Groupは同じExercise内だけで共有できます');

    const collision = cloneCourse();
    const collisionRules = firstStandardExercise(firstStandardLesson(collision)).validationRules;
    const collidingRule = structuredClone(collisionRules[0]!);
    collidingRule.id = 'rule-colliding-group';
    collisionRules[0]!.groupId = collidingRule.id;
    collisionRules.push(collidingRule);
    expectCourseIssue(collision, 'Rule Group IDはRule IDと衝突できません');

    const selfGroup = cloneCourse();
    const selfRule = firstStandardExercise(firstStandardLesson(selfGroup)).validationRules[0]!;
    selfRule.groupId = selfRule.id;
    expectCourseIssue(selfGroup, '自Ruleと同じ場合はgroupIdを省略してください');
  });

  it('File path、Viewport ID、owner内Asset IDの重複を拒否する', () => {
    const duplicateFile = cloneCourse();
    const fileExercise = firstStandardExercise(firstStandardLesson(duplicateFile));
    fileExercise.files.push({ ...structuredClone(fileExercise.files[0]!), path: './index.html' });
    expectCourseIssue(duplicateFile, 'Exercise File pathが重複しています');

    const duplicateViewport = cloneCourse();
    const viewportExercise = firstStandardExercise(firstStandardLesson(duplicateViewport));
    viewportExercise.previewViewports.push(structuredClone(viewportExercise.previewViewports[0]!));
    expectCourseIssue(duplicateViewport, 'Viewport IDが重複しています');

    const duplicateAsset = cloneCourse();
    const slide = firstStandardLesson(duplicateAsset).slides[0]!;
    const asset = {
      id: 'duplicate-local-asset',
      path: 'generated/content/assets/duplicate.png',
      mediaType: 'image' as const,
      alt: '重複画像',
      provenanceId: 'duplicate-local-provenance',
    };
    slide.assets.push(asset, structuredClone(asset));
    expectCourseIssue(duplicateAsset, 'Asset IDが重複しています');
  });

  it('Guided Projectだけが同じproject/workspaceを共有できる', () => {
    const guided = makeGuidedProjectCourse();
    expect(CourseManifestSchema.safeParse(guided).success).toBe(true);

    const standard = makeTwoLessonCourse();
    const standardLessons = standard.phases[0]!.chapters[0]!.lessons;
    standardLessons[1]!.exercises[0]!.workspaceId = standardLessons[0]!.exercises[0]!.workspaceId;
    expectCourseIssue(standard, 'Standard Exercise間でworkspaceを共有できません');

    const mixedProject = makeGuidedProjectCourse();
    const second = mixedProject.phases[0]!.chapters[0]!.lessons[1];
    if (second?.kind !== 'guided-project' || second.exercises[0]?.kind !== 'guided-project') {
      throw new Error('Guided fixtureがありません');
    }
    second.project.id = 'other-project';
    second.exercises[0].projectId = 'other-project';
    expectCourseIssue(mixedProject, 'workspaceは1つのprojectだけに所属できます');

    const mixedKind = makeGuidedProjectCourse();
    const mixedKindChapter = mixedKind.phases[0]!.chapters[0]!;
    const guidedSecond = mixedKindChapter.lessons[1];
    if (
      guidedSecond?.kind !== 'guided-project' ||
      guidedSecond.exercises[0]?.kind !== 'guided-project'
    ) {
      throw new Error('Guided fixtureがありません');
    }
    const capstoneExercise: CapstoneExercise = {
      ...guidedSecond.exercises[0],
      kind: 'capstone',
    };
    const requirementId =
      capstoneExercise.validationRules[0]!.groupId ?? capstoneExercise.validationRules[0]!.id;
    const capstoneLesson: CapstoneLesson = {
      ...guidedSecond,
      kind: 'capstone',
      exercises: [capstoneExercise],
      completion: {
        kind: 'capstone',
        requiredRuleIds: [requirementId],
        requiredViewportIds: ['desktop'],
      },
    };
    mixedKindChapter.lessons[1] = capstoneLesson;
    mixedKind.expectedTotals.guidedProjectLessons = 1;
    mixedKind.expectedTotals.capstoneLessons = 1;
    expectCourseIssue(mixedKind, 'CapstoneではLesson間共有できません');

    const twoCapstones = makeGuidedProjectCourse();
    const capstoneChapter = twoCapstones.phases[0]!.chapters[0]!;
    capstoneChapter.kind = 'capstone';
    capstoneChapter.lessons = capstoneChapter.lessons.map((lesson) => {
      if (lesson.kind !== 'guided-project' || lesson.exercises[0]?.kind !== 'guided-project') {
        throw new Error('Guided fixtureがありません');
      }
      const exercise: CapstoneExercise = { ...lesson.exercises[0], kind: 'capstone' };
      const requirement = exercise.validationRules[0]!.groupId ?? exercise.validationRules[0]!.id;
      const capstone: CapstoneLesson = {
        ...lesson,
        kind: 'capstone',
        exercises: [exercise],
        completion: {
          kind: 'capstone',
          requiredRuleIds: [requirement],
          requiredViewportIds: ['desktop'],
        },
      };
      return capstone;
    });
    twoCapstones.expectedTotals.guidedProjectLessons = 0;
    twoCapstones.expectedTotals.capstoneLessons = 2;
    expectCourseIssue(twoCapstones, 'CapstoneではLesson間共有できません');
  });

  it('教材内Slide／Exercise参照を同じLessonへ限定する', () => {
    const slideReference = makeTwoLessonCourse();
    const slideLessons = slideReference.phases[0]!.chapters[0]!.lessons;
    slideLessons[0]!.exercises[0]!.relatedSlideIds = [slideLessons[1]!.slides[0]!.id];
    expectCourseIssue(slideReference, '同じLesson内のSlide参照先が存在しません');

    const exerciseReference = makeTwoLessonCourse();
    const exerciseLessons = exerciseReference.phases[0]!.chapters[0]!.lessons;
    if (exerciseLessons[0]?.kind !== 'standard') throw new Error('Standard fixtureがありません');
    exerciseLessons[0].completion.requiredExerciseIds = [exerciseLessons[1]!.exercises[0]!.id];
    expectCourseIssue(exerciseReference, '同じLesson内のExercise参照先が存在しません');

    const hintReference = makeTwoLessonCourse();
    const hintLessons = hintReference.phases[0]!.chapters[0]!.lessons;
    hintLessons[0]!.exercises[0]!.hints[0]!.relatedSlideId = hintLessons[1]!.slides[0]!.id;
    expectCourseIssue(hintReference, '同じLesson内のSlide参照先が存在しません');

    const ruleReference = makeTwoLessonCourse();
    const ruleLessons = ruleReference.phases[0]!.chapters[0]!.lessons;
    ruleLessons[0]!.exercises[0]!.validationRules[0]!.relatedSlideId =
      ruleLessons[1]!.slides[0]!.id;
    expectCourseIssue(ruleReference, '同じLesson内のSlide参照先が存在しません');
  });

  it('Slide 0件の制作Lessonは前提Lessonの既習Slideだけを復習先にできる', () => {
    const course = makeGuidedProjectCourse();
    const lessons = course.phases[0]!.chapters[0]!.lessons;
    const prerequisiteSlideId = lessons[0]!.slides[0]!.id;
    const projectLesson = lessons[1]!;
    const projectExercise = projectLesson.exercises[0]!;
    projectLesson.slides = [];
    projectExercise.relatedSlideIds = [prerequisiteSlideId];
    for (const hint of projectExercise.hints) hint.relatedSlideId = prerequisiteSlideId;
    for (const rule of projectExercise.validationRules) {
      rule.relatedSlideId = prerequisiteSlideId;
    }
    course.expectedTotals.conceptSlides = 1;

    expect(CourseManifestSchema.safeParse(course).success).toBe(true);

    projectLesson.prerequisiteLessonIds = [];
    expectCourseIssue(course, 'Slide 0件の制作Lessonは前提Lesson内のSlideだけ');
  });

  it('prerequisiteは先行Lesson、nextLessonは後続Lessonだけを許可する', () => {
    const futurePrerequisite = makeTwoLessonCourse();
    const futureLessons = futurePrerequisite.phases[0]!.chapters[0]!.lessons;
    futureLessons[0]!.prerequisiteLessonIds = [futureLessons[1]!.id];
    expectCourseIssue(
      futurePrerequisite,
      'prerequisiteLessonIdsは先行Lessonだけ',
      'phases.0.chapters.0.lessons.0.prerequisiteLessonIds.0',
    );

    const backwardNext = makeTwoLessonCourse();
    const nextLessons = backwardNext.phases[0]!.chapters[0]!.lessons;
    nextLessons[1]!.nextLessonId = nextLessons[0]!.id;
    expectCourseIssue(
      backwardNext,
      'nextLessonIdは後続Lessonだけ',
      'phases.0.chapters.0.lessons.1.nextLessonId',
    );

    const selfCourse = cloneCourse();
    selfCourse.prerequisites = [selfCourse.id];
    expectCourseIssue(selfCourse, 'Courseは自分自身をprerequisiteにできません');

    const selfLesson = cloneCourse();
    const lesson = firstStandardLesson(selfLesson);
    lesson.prerequisiteLessonIds = [lesson.id];
    expectCourseIssue(selfLesson, 'prerequisiteLessonIdsは先行Lessonだけ');
  });

  it('Glossary関連語の自己参照、重複、欠落を拒否する', () => {
    for (const relatedIds of [['html'], ['element', 'element'], ['missing-term']]) {
      const course = cloneCourse();
      course.glossary[0]!.relatedIds = relatedIds;
      expectCourseIssue(course, /Glossary関連語/);
    }
  });
});

describe('CourseManifestSchema Asset、Rule、completion', () => {
  it('Asset intrinsic寸法は有限正数のwidth／height pairだけを受理する', () => {
    const asset = {
      id: 'diagram-heading',
      path: 'generated/content/assets/diagram-heading.svg',
      mediaType: 'image',
      provenanceId: 'diagram-heading-provenance',
    };

    expect(
      AssetRefSchema.safeParse({
        ...asset,
        intrinsicWidth: 640,
        intrinsicHeight: 360,
      }).success,
    ).toBe(true);
    expect(AssetRefSchema.safeParse({ ...asset, intrinsicWidth: 640 }).success).toBe(false);
    expect(
      AssetRefSchema.safeParse({
        ...asset,
        intrinsicWidth: Number.POSITIVE_INFINITY,
        intrinsicHeight: 360,
      }).success,
    ).toBe(false);
    expect(
      AssetRefSchema.safeParse({ ...asset, intrinsicWidth: 640, intrinsicHeight: 0 }).success,
    ).toBe(false);
  });

  it('image blockを同じownerのAssetだけへ結び、別ownerでのAsset再利用を許可する', () => {
    const valid = cloneCourse();
    const lesson = firstStandardLesson(valid);
    const exercise = firstStandardExercise(lesson);
    const sharedAsset = {
      id: 'diagram-heading',
      path: 'generated/content/assets/diagram-heading.png',
      mediaType: 'image' as const,
      alt: '見出し構造の図',
      provenanceId: 'diagram-heading-provenance',
      intrinsicWidth: 640,
      intrinsicHeight: 360,
    };
    lesson.slides[0]!.assets.push(sharedAsset);
    lesson.slides[0]!.blocks.push({
      type: 'image',
      assetId: sharedAsset.id,
      alt: '見出し構造の図',
    });
    exercise.assets.push(structuredClone(sharedAsset));
    exercise.instructions.push({
      type: 'image',
      assetId: sharedAsset.id,
      alt: '見出し構造の図',
    });
    expect(CourseManifestSchema.safeParse(valid).success).toBe(true);

    const conflictingReuse = structuredClone(valid);
    firstStandardExercise(firstStandardLesson(conflictingReuse)).assets[0]!.path =
      'generated/content/assets/other-diagram.png';
    expectCourseIssue(conflictingReuse, 'Asset IDの定義がowner間で一致しません');

    const conflictingDimensions = structuredClone(valid);
    firstStandardExercise(firstStandardLesson(conflictingDimensions)).assets[0]!.intrinsicWidth =
      800;
    expectCourseIssue(conflictingDimensions, 'Asset IDの定義がowner間で一致しません');

    const invalid = cloneCourse();
    firstStandardExercise(firstStandardLesson(invalid)).instructions.push({
      type: 'image',
      assetId: 'missing-asset',
      alt: '不足Asset',
    });
    expectCourseIssue(invalid, 'Exercise画像Asset参照先が存在しません');

    const otherOwner = cloneCourse();
    const otherOwnerLesson = firstStandardLesson(otherOwner);
    otherOwnerLesson.slides[0]!.assets.push(sharedAsset);
    firstStandardExercise(otherOwnerLesson).instructions.push({
      type: 'image',
      assetId: sharedAsset.id,
      alt: '別ownerのAsset',
    });
    expectCourseIssue(otherOwner, 'Exercise画像Asset参照先が存在しません');

    const wrongMedia = cloneCourse();
    const wrongMediaSlide = firstStandardLesson(wrongMedia).slides[0]!;
    wrongMediaSlide.assets.push({
      id: 'font-as-image',
      path: 'generated/content/assets/font.woff2',
      mediaType: 'font',
      provenanceId: 'font-provenance',
    });
    wrongMediaSlide.blocks.push({
      type: 'image',
      assetId: 'font-as-image',
      alt: 'Fontを画像扱いする不正例',
    });
    expectCourseIssue(wrongMedia, 'image blockはmediaType=imageのAssetだけ');
  });

  it('Asset fieldを持たないProject brief／guideのimage blockを拒否する', () => {
    const course = makeGuidedProjectCourse();
    const lesson = course.phases[0]!.chapters[0]!.lessons[0];
    if (lesson?.kind !== 'guided-project') throw new Error('Guided fixtureがありません');
    lesson.project.brief.push({
      type: 'image',
      assetId: 'unowned-project-image',
      alt: '所有者のない画像',
    });
    expectCourseIssue(course, 'Project brief／guideではimage blockを使用できません');
  });

  it('HTML/CSS node targetとoperator別expectedを厳密に検証する', () => {
    const emptyNode = cloneCourse();
    firstStandardExercise(firstStandardLesson(emptyNode)).validationRules[0]!.target = {
      kind: 'node',
    };
    expectCourseIssue(emptyNode, 'HTML/CSS Validator Ruleの形式が不正です');

    const unexpected = cloneCourse();
    firstStandardExercise(firstStandardLesson(unexpected)).validationRules[0]!.assertion = {
      kind: 'attribute',
      name: 'aria-label',
      operator: 'present',
      expected: '見出し',
    };
    expectCourseIssue(unexpected, 'HTML/CSS Validator Ruleの形式が不正です');

    const missing = cloneCourse();
    firstStandardExercise(firstStandardLesson(missing)).validationRules[0]!.assertion = {
      kind: 'attribute',
      name: 'aria-label',
      operator: 'equals',
    };
    expectCourseIssue(missing, 'HTML/CSS Validator Ruleの形式が不正です');

    for (const assertion of [
      { kind: 'accessible-name', operator: 'present', expected: '名前' },
      { kind: 'role', operator: 'present', expected: 'button' },
    ]) {
      const presentWithExpected = cloneCourse();
      firstStandardExercise(
        firstStandardLesson(presentWithExpected),
      ).validationRules[0]!.assertion = assertion;
      expectCourseIssue(presentWithExpected, 'HTML/CSS Validator Ruleの形式が不正です');
    }

    const emptyContains = cloneCourse();
    firstStandardExercise(firstStandardLesson(emptyContains)).validationRules[0]!.assertion = {
      kind: 'text',
      operator: 'contains',
      expected: '',
    };
    expectCourseIssue(emptyContains, 'HTML/CSS Validator Ruleの形式が不正です');
  });

  it('Standard finalSlideをLesson末尾へ固定する', () => {
    const course = cloneCourse();
    const lesson = firstStandardLesson(course);
    lesson.slides.push({
      id: 'slide-reflection-last',
      title: '振り返り',
      kind: 'reflection',
      layout: 'checkpoint',
      teachesConceptIds: ['html-element'],
      masteryTarget: 'read',
      screenBudget: { maxTextCharacters: 120, maxCodeLines: 0, maxVisuals: 0 },
      blocks: [{ type: 'paragraph', text: '見出しの役割を振り返ります。' }],
      assets: [],
    });
    expectCourseIssue(course, 'finalSlideIdはLesson末尾Slideと一致');
  });

  it('Guided completionの必須Checklist集合をrequired=trueと一致させる', () => {
    const course = makeGuidedProjectCourse();
    const lesson = course.phases[0]!.chapters[0]!.lessons[0];
    if (lesson?.kind !== 'guided-project') throw new Error('Guided fixtureがありません');
    lesson.completion.requiredChecklistItemIds = [];
    expectCourseIssue(course, '必須Checklist IDがrequired=trueの集合と一致しません');

    const emptyRules = makeGuidedProjectCourse();
    const emptyRulesLesson = emptyRules.phases[0]!.chapters[0]!.lessons[0];
    if (emptyRulesLesson?.kind !== 'guided-project') {
      throw new Error('Guided fixtureがありません');
    }
    emptyRulesLesson.project.checklist[0]!.ruleIds = [];
    expect(CourseManifestSchema.safeParse(emptyRules).success).toBe(false);
  });

  it('Capstone必須Ruleが全requiredViewportをall評価することを要求する', () => {
    expect(CourseManifestSchema.safeParse(makeCapstoneCourse(true)).success).toBe(true);
    expectCourseIssue(
      makeCapstoneCourse(false),
      'Capstone必須Ruleは全requiredViewportをviewportMode=allで評価してください',
    );

    const anyViewport = makeCapstoneCourse(true);
    anyViewport.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!.validationRules[0]!.viewportMode =
      'any';
    expectCourseIssue(
      anyViewport,
      'Capstone必須Ruleは全requiredViewportをviewportMode=allで評価してください',
    );
  });
});

describe('CourseManifestSchema kind、順序、集計', () => {
  it.each([0, 2])('Concept系SlideのMicro-practice %i件を拒否する', (count) => {
    const course = cloneCourse();
    const slide = firstStandardLesson(course).slides[0]!;
    slide.blocks = slide.blocks.filter((block) => block.type !== 'practice');
    if (count === 2) {
      const practice = {
        type: 'practice' as const,
        prompt: '確認する',
        expectedAction: 'Previewを見る',
        estimatedMinutes: 1,
      };
      slide.blocks.push(practice, { ...practice, prompt: 'もう一度確認する' });
    }
    expectCourseIssue(course, 'Concept Slideは5分以内のMicro-practiceを1件');
  });

  it('Concept系Slideのconcept欠落を拒否する', () => {
    const course = cloneCourse();
    Reflect.deleteProperty(firstStandardLesson(course).slides[0]!, 'concept');
    expectCourseIssue(course, 'Concept系Slideはconceptを指定してください');
  });

  it('Slide内のlevel 3見出しより前にlevel 2見出しを要求する', () => {
    const valid = cloneCourse();
    firstStandardLesson(valid).slides[0]!.blocks.unshift(
      { type: 'heading', level: 2, text: 'HTMLの役割' },
      { type: 'heading', level: 3, text: '意味を積む' },
    );
    expect(CourseManifestSchema.safeParse(valid).success).toBe(true);

    const invalid = cloneCourse();
    firstStandardLesson(invalid).slides[0]!.blocks.unshift({
      type: 'heading',
      level: 3,
      text: '先に現れる小見出し',
    });
    expectCourseIssue(invalid, 'level 3見出しより前にlevel 2見出しを置いてください');
  });

  it('Chapter／Lesson／Exercise kindとProject count flagの矛盾を拒否する', () => {
    const chapterKind = cloneCourse();
    chapterKind.phases[0]!.chapters[0]!.kind = 'guided-project';
    expectCourseIssue(chapterKind, 'Lesson kindとChapter kindが一致しません');

    const guided = makeGuidedProjectCourse();
    guided.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!.countsTowardStandardExerciseTotal = true;
    expectCourseIssue(guided, 'Project ExerciseはStandard Exercise集計へ含められません');

    const exerciseKind = cloneCourse();
    Object.assign(firstStandardExercise(firstStandardLesson(exerciseKind)), {
      kind: 'guided-project',
      projectId: 'foreign-project',
    });
    expectCourseIssue(exerciseKind, 'Exercise kindとLesson kindが一致しません');

    const projectId = makeGuidedProjectCourse();
    const guidedLesson = projectId.phases[0]!.chapters[0]!.lessons[0];
    if (
      guidedLesson?.kind !== 'guided-project' ||
      guidedLesson.exercises[0]?.kind !== 'guided-project'
    ) {
      throw new Error('Guided fixtureがありません');
    }
    guidedLesson.exercises[0].projectId = 'foreign-project';
    expectCourseIssue(projectId, 'Exercise projectIdとLesson project.idが一致しません');
  });

  it('FlattenしたChapter sequenceを0..n-1へ固定する', () => {
    const course = cloneCourse();
    course.phases[0]!.chapters[0]!.sequence = 1;
    expectCourseIssue(course, 'Chapter sequenceは配列順の0..n-1');
  });

  it.each([
    ['Chapter', (course: CourseManifest) => (course.phases[0]!.chapters[0]!.estimatedMinutes = 16)],
    ['Course', (course: CourseManifest) => (course.estimatedMinutes = 16)],
    ['expectedTotals', (course: CourseManifest) => (course.expectedTotals.estimatedMinutes = 16)],
  ])('%sの推定時間差を拒否する', (_label, mutate) => {
    const course = cloneCourse();
    mutate(course);
    expectCourseIssue(course, /estimatedMinutes|推定時間/);
  });

  it.each([
    'chapters',
    'lessons',
    'standardExercises',
    'guidedProjectLessons',
    'capstoneLessons',
  ] as const)('expectedTotals.%sの実集計差を拒否する', (key) => {
    const course = cloneCourse();
    course.expectedTotals[key] += 1;
    expectCourseIssue(course, `expectedTotals.${key}`);
  });

  it('expectedTotals.conceptSlidesを追加分割可能な最低枚数として扱う', () => {
    const course = cloneCourse();
    course.expectedTotals.conceptSlides = 0;

    expect(CourseManifestSchema.safeParse(course).success).toBe(true);

    course.expectedTotals.conceptSlides = 2;
    expectCourseIssue(course, 'Concept Slideの最低枚数');
  });
});

describe('CourseManifestSchema progress migration', () => {
  it('空migrationとA→B→Cの2段階mapを受理する', () => {
    expect(CourseManifestSchema.safeParse(fixtureCourse).success).toBe(true);
    const course = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-middle',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-old',
            toId: 'exercise-middle',
          },
        ],
      },
      {
        fromRevision: 'revision-middle',
        toRevision: 'revision-current',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-middle',
            toId: 'exercise-first-heading',
          },
        ],
      },
    ]);
    expect(CourseManifestSchema.safeParse(course).success).toBe(true);
  });

  it('後続edgeの暗黙preserveと明示resetを受理する', () => {
    const implicit = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-middle',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-old',
            toId: 'exercise-first-heading',
          },
        ],
      },
      { fromRevision: 'revision-middle', toRevision: 'revision-current', steps: [] },
    ]);
    expect(CourseManifestSchema.safeParse(implicit).success).toBe(true);

    const reset = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-middle',
        steps: [{ action: 'map-to', entity: 'hint', fromId: 'hint-old', toId: 'hint-middle' }],
      },
      {
        fromRevision: 'revision-middle',
        toRevision: 'revision-current',
        steps: [
          {
            action: 'intentionally-reset',
            entity: 'hint',
            id: 'hint-middle',
            reason: 'Hint構成を全面改訂したため',
          },
        ],
      },
    ]);
    expect(CourseManifestSchema.safeParse(reset).success).toBe(true);

    const simultaneous = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-old',
            toId: 'exercise-first-heading',
          },
          {
            action: 'intentionally-reset',
            entity: 'exercise',
            id: 'exercise-first-heading',
            reason: '旧recordだけを隔離するため',
          },
        ],
      },
    ]);
    expect(CourseManifestSchema.safeParse(simultaneous).success).toBe(true);
  });

  it('Hint、Rule requirement、workspaceの現行IDをmigration inventoryへ含める', () => {
    const course = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [
          { action: 'preserve', entity: 'hint', id: 'hint-h1-1' },
          { action: 'preserve', entity: 'rule', id: 'rule-h1-exists' },
          { action: 'preserve', entity: 'workspace', id: 'workspace-first-heading' },
        ],
      },
    ]);
    expect(CourseManifestSchema.safeParse(course).success).toBe(true);
  });

  it('同一edgeのsource重複、target衝突、self mapを拒否する', () => {
    const duplicateSource = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [
          { action: 'preserve', entity: 'exercise', id: 'exercise-first-heading' },
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-first-heading',
            toId: 'exercise-first-heading',
          },
        ],
      },
    ]);
    expectCourseIssue(duplicateSource, '同じ旧IDへのactionが重複しています');

    const targetCollision = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-old-a',
            toId: 'exercise-first-heading',
          },
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-old-b',
            toId: 'exercise-first-heading',
          },
        ],
      },
    ]);
    expectCourseIssue(targetCollision, '同じ移行先IDが重複しています');

    const selfMap = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-first-heading',
            toId: 'exercise-first-heading',
          },
        ],
      },
    ]);
    expectCourseIssue(selfMap, '同じIDへのmap-toではpreserveを使用してください');
  });

  it.each([
    [
      'gap',
      'migration chainが途中で切れています',
      [
        { fromRevision: 'revision-old', toRevision: 'revision-middle', steps: [] },
        { fromRevision: 'revision-other', toRevision: 'revision-current', steps: [] },
      ],
      'revision-current',
    ],
    [
      'branch',
      'fromRevisionが重複しています',
      [
        { fromRevision: 'revision-old', toRevision: 'revision-middle', steps: [] },
        { fromRevision: 'revision-old', toRevision: 'revision-current', steps: [] },
      ],
      'revision-current',
    ],
    [
      'merge',
      'toRevisionが重複しています',
      [
        { fromRevision: 'revision-old', toRevision: 'revision-current', steps: [] },
        { fromRevision: 'revision-current', toRevision: 'revision-current', steps: [] },
      ],
      'revision-current',
    ],
    [
      'cycle',
      'migration revisionがcycleしています',
      [
        { fromRevision: 'revision-old', toRevision: 'revision-middle', steps: [] },
        { fromRevision: 'revision-middle', toRevision: 'revision-old', steps: [] },
      ],
      'revision-old',
    ],
    [
      'current未到達',
      '現行revisionへ到達しません',
      [{ fromRevision: 'revision-old', toRevision: 'revision-middle', steps: [] }],
      'revision-current',
    ],
    [
      '配列順不一致',
      'migration配列順がoldest→currentではありません',
      [
        { fromRevision: 'revision-middle', toRevision: 'revision-later', steps: [] },
        { fromRevision: 'revision-old', toRevision: 'revision-middle', steps: [] },
        { fromRevision: 'revision-later', toRevision: 'revision-current', steps: [] },
      ],
      'revision-current',
    ],
  ] as const)('%sを拒否する', (_label, message, migrations, revision) => {
    const course = withMigrations(
      revision,
      structuredClone(migrations) as unknown as ContentProgressMigration[],
    );
    expectCourseIssue(course, message);
  });

  it('現行entity IDにも後続resetにも到達しない終端を拒否する', () => {
    const dangling = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-old',
            toId: 'missing-current-exercise',
          },
        ],
      },
    ]);
    expectCourseIssue(dangling, 'migration終端が現行IDへ到達しません');

    const wrongEntity = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-old',
            toId: 'slide-html-role',
          },
        ],
      },
    ]);
    expectCourseIssue(wrongEntity, 'migration終端が現行IDへ到達しません');

    const danglingPreserve = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [{ action: 'preserve', entity: 'hint', id: 'missing-current-hint' }],
      },
    ]);
    expectCourseIssue(danglingPreserve, 'migration終端が現行IDへ到達しません');
  });

  it('同一edge内のmapを配列順で連鎖させない', () => {
    const course = withMigrations('revision-current', [
      {
        fromRevision: 'revision-old',
        toRevision: 'revision-current',
        steps: [
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-old',
            toId: 'exercise-middle',
          },
          {
            action: 'map-to',
            entity: 'exercise',
            fromId: 'exercise-middle',
            toId: 'exercise-first-heading',
          },
        ],
      },
    ]);
    expectCourseIssue(course, 'migration終端が現行IDへ到達しません');
  });
});
