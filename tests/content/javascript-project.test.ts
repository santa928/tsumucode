import { beforeAll, expect, it } from 'vitest';
import {
  loadAuthoringCourse,
  type AuthoringCoursePackage,
} from '../../scripts/content/compileCourse';
import { assertChapterConceptCoverage } from './concept-coverage';
import { CourseManifestSchema } from '../../src/core/content/schema';
import {
  splitCourseArtifacts,
  reconstructCourseManifest,
} from '../../scripts/content/splitCourseArtifacts';
import {
  recordValidation,
  recordValidationFromIndex,
} from '../../src/core/persistence/progressUpdates';
import { exerciseRequirementIds } from '../../src/core/content/exerciseRequirementIds';

let authoring: AuthoringCoursePackage;
/** 6制作教材を実authoring loaderで読み、公開契約と制作接続を検証する。 */
beforeAll(async () => {
  authoring = await loadAuthoringCourse('content/javascript');
}, 30_000);

it('既存標準46を保持し、Guided5・Capstone1を独立Workspaceへ接続する', () => {
  const course = authoring.runtime;
  expect(course.publicationStatus).toBe('published');
  expect(course.estimatedMinutes).toBe(1010);
  expect(course.phases).toHaveLength(4);
  const chapters = course.phases.flatMap(({ chapters }) => chapters);
  expect(chapters).toHaveLength(14);
  const lessons = chapters.flatMap(({ lessons }) => lessons);
  expect(lessons).toHaveLength(52);
  expect(lessons.filter(({ kind }) => kind === 'standard')).toHaveLength(46);
  expect(
    authoring.exercises.filter(
      ({ countsTowardStandardExerciseTotal }) => countsTowardStandardExerciseTotal,
    ),
  ).toHaveLength(48);
  const guided = lessons.filter(({ kind }) => kind === 'guided-project');
  expect(guided).toHaveLength(5);
  expect(guided.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0)).toBe(100);
  expect(
    guided.flatMap(({ exercises }) => exercises).map(({ workspaceId }) => workspaceId),
  ).toEqual(Array(5).fill('javascript-quiz-guided'));
  const capstone = lessons.filter(({ kind }) => kind === 'capstone');
  expect(capstone).toHaveLength(1);
  expect(capstone[0]?.estimatedMinutes).toBe(150);
  expect(capstone[0]?.exercises[0]?.workspaceId).toBe('javascript-quiz-capstone');
  expect(authoring.exercises).toHaveLength(54);
  const required = lessons.flatMap((lesson) =>
    lesson.completion.kind === 'capstone'
      ? lesson.exercises
          .filter((exercise) =>
            exerciseRequirementIds(exercise).some(
              (id) =>
                lesson.completion.kind === 'capstone' &&
                lesson.completion.requiredRuleIds.includes(id),
            ),
          )
          .map(({ id }) => id)
      : lesson.completion.requiredExerciseIds,
  );
  expect(required).toHaveLength(52);
  expect(authoring.exercises.filter(({ id }) => !required.includes(id))).toHaveLength(2);
});

it('宣言したcheckpointの制作参照を分割配信と現在完了へ結ぶ', () => {
  const course = authoring.runtime;
  const split = splitCourseArtifacts(course);
  expect(reconstructCourseManifest(split.index, split.lessons)).toEqual(course);
  const projects = course.phases
    .flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
    .filter(({ kind }) => kind !== 'standard');
  for (const lesson of projects) {
    const exercise = lesson.exercises[0]!;
    const passed = {
      exerciseId: exercise.id,
      executionRevision: 1,
      status: 'pass' as const,
      checks: [],
      passedRequirementIds: exerciseRequirementIds(exercise),
      diagnostics: [],
      evaluatedAt: '2026-10-02T00:00:00.000Z',
    };
    const full = recordValidation(undefined, course, lesson, exercise, passed);
    const indexed = recordValidationFromIndex(undefined, split.index, lesson, exercise, passed);
    expect(indexed).toEqual(full);
    expect(full.lessons[lesson.id]?.currentComplete).toBe(true);
    const missing = {
      ...passed,
      status: 'incomplete' as const,
      passedRequirementIds: passed.passedRequirementIds.slice(0, -1),
    };
    expect(
      recordValidationFromIndex(full, split.index, lesson, exercise, missing).lessons[lesson.id]
        ?.currentComplete,
    ).toBe(false);
  }
});

it('制作参照は未知checkpoint・他Lesson・個別expectation・重複を拒否する', () => {
  for (const id of [
    'interaction:unknown:missing',
    'interaction:g2-answer:loaded',
    'interaction:g1-show:loaded:question',
    'group:missing',
  ]) {
    const course = structuredClone(authoring.runtime);
    const lesson = course.phases[3]!.chapters[0]!.lessons[0]!;
    if (lesson.kind !== 'guided-project') throw new Error('Guided fixtureがありません');
    lesson.project.checklist[1]!.ruleIds = [id];
    expect(CourseManifestSchema.safeParse(course).success).toBe(false);
  }
  const duplicate = structuredClone(authoring.runtime);
  const lesson = duplicate.phases[3]!.chapters[0]!.lessons[0]!;
  if (lesson.kind !== 'guided-project') throw new Error('Guided fixtureがありません');
  lesson.project.checklist[1]!.ruleIds = [
    'interaction:g1-show:loaded',
    'interaction:g1-show:loaded',
  ];
  expect(CourseManifestSchema.safeParse(duplicate).success).toBe(false);
});

it('Capstoneは他Exerciseだけのviewportを操作checkpointの観測済みとして受理しない', () => {
  const course = structuredClone(authoring.runtime);
  const lesson = course.phases[3]!.chapters[1]!.lessons[0]!;
  if (lesson.kind !== 'capstone') throw new Error('Capstone fixtureがありません');
  const extra = structuredClone(lesson.exercises[0]!);
  extra.id = 'javascript-ch13-l01-e02';
  delete extra.interactionScenarios;
  extra.previewViewports = [{ id: 'mobile-390', width: 390, height: 844 }];
  extra.hints = extra.hints.map((hint, i) => ({ ...hint, id: 'cap-extra-h0' + String(i + 1) }));
  extra.validationRules = extra.validationRules.map((rule) => ({
    ...rule,
    id: 'cap-extra-rule',
    viewportIds: ['mobile-390'],
    hintId: 'cap-extra-h01',
  }));
  lesson.exercises.push(extra);
  lesson.completion.requiredRuleIds = ['interaction:cap-web:finished'];
  lesson.completion.requiredViewportIds = ['mobile-390'];
  expect(CourseManifestSchema.safeParse(course).success).toBe(false);
});

it('制作Conceptと全工程の同じFile契約を閉じ、別解・機能欠落を保持する', () => {
  const chapters = authoring.runtime.phases.flatMap(({ chapters }) => chapters);
  for (const chapterId of ['javascript-ch12', 'javascript-ch13']) {
    const chapter = chapters.find(({ id }) => id === chapterId)!;
    assertChapterConceptCoverage(
      {
        missingSlideMetadata: authoring.missingSlideMetadata,
        missingExerciseMetadata: authoring.missingExerciseMetadata,
        unmetRequirements: authoring.masteryDiagnostics,
      },
      chapterId,
      chapter.lessons.map(({ id }) => id),
      chapter.lessons.map(({ id }) => id),
    );
  }
  const projects = authoring.exercises.filter(({ id }) => /^javascript-ch1[23]-/u.test(id));
  expect(projects).toHaveLength(6);
  for (const exercise of projects) {
    expect(exercise.runtime).toMatchObject({
      entryFile: 'main.js',
      sourceType: 'module',
      capabilityProfile: 'project',
      primaryOutput: 'preview',
    });
    expect(exercise.files.map(({ path }) => path)).toEqual([
      'index.html',
      'styles.css',
      'questions.js',
      'main.js',
    ]);
    expect(exercise.interactionScenarios?.length).toBeGreaterThan(0);
    expect(exercise.interactionScenarios?.length).toBeLessThanOrEqual(4);
    expect(
      exercise.fixtures.filter(({ expectedStatus }) => expectedStatus === 'pass').length,
    ).toBeGreaterThanOrEqual(2);
    expect(exercise.fixtures.some(({ id }) => id === 'unused-import')).toBe(true);
    expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'code-error')).toBe(
      true,
    );
    expect(exercise.fixtures.some(({ expectedStatus }) => expectedStatus === 'system-error')).toBe(
      true,
    );
  }
});
