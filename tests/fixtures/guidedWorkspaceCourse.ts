/** 共有workspaceのController・Page・Repository統合契約を検証する非公開Course fixture。 */
import { CourseManifestSchema } from '../../src/core/content/schema';
import type { CourseManifest, Exercise, Lesson } from '../../src/core/content/types';
import { fixtureCourse } from './course';

type StandardLesson = Extract<Lesson, { kind: 'standard' }>;
type GuidedLesson = Extract<Lesson, { kind: 'guided-project' }>;
type StandardExercise = Extract<Exercise, { kind: 'standard' }>;
type GuidedExercise = Extract<Exercise, { kind: 'guided-project' }>;

const PROJECT_ID = 'fixture-guided-project';
export const GUIDED_WORKSPACE_ID = 'fixture-guided-workspace';

/** Standard LessonをID・Viewport・Assetが異なる共有workspace工程へ変換する。 */
function createGuidedStep(base: StandardLesson, step: 1 | 2): GuidedLesson {
  const slide = structuredClone(base.slides[0]!);
  const standardExercise = structuredClone(base.exercises[0] as StandardExercise);
  const slideId = `slide-guided-step-${String(step)}`;
  const exerciseId = `exercise-guided-step-${String(step)}`;
  const ruleId = `rule-guided-step-${String(step)}`;
  const viewportId = `viewport-guided-step-${String(step)}`;
  const hints = standardExercise.hints.map((hint) => ({
    ...hint,
    id: `hint-guided-step-${String(step)}-${String(hint.level)}`,
    relatedSlideId: slideId,
  }));
  const rule = {
    ...standardExercise.validationRules[0]!,
    id: ruleId,
    label: `工程${String(step)}の構造がある`,
    viewportIds: [viewportId],
    hintId: hints[0]!.id,
    relatedSlideId: slideId,
  };
  const files = [
    ...standardExercise.files.map((file) => ({
      ...file,
      content: `<main>工程${String(step)} starter</main>`,
    })),
    ...(step === 2
      ? [
          {
            path: 'styles.css',
            language: 'css',
            content: 'main { display: block; }',
            editable: true,
          } as const,
        ]
      : []),
  ];
  const exercise: GuidedExercise = {
    ...standardExercise,
    id: exerciseId,
    kind: 'guided-project',
    projectId: PROJECT_ID,
    workspaceId: GUIDED_WORKSPACE_ID,
    countsTowardStandardExerciseTotal: false,
    title: `共有workspace 工程${String(step)}`,
    files,
    validationRules: [rule],
    hints,
    relatedSlideIds: [slideId],
    previewViewports: [
      {
        id: viewportId,
        width: step === 1 ? 1280 : 390,
        height: step === 1 ? 720 : 844,
      },
    ],
    assets: [
      {
        id: `asset-guided-step-${String(step)}`,
        path: `assets/guided-step-${String(step)}.png`,
        mediaType: 'image',
        alt: `工程${String(step)}のfixture画像`,
        provenanceId: `provenance-guided-step-${String(step)}`,
      },
    ],
  };
  slide.id = slideId;
  slide.title = `共有workspace 工程${String(step)}の設計図`;
  slide.assets = [];
  const checklistId = `checklist-guided-step-${String(step)}`;
  return {
    ...base,
    id: `lesson-guided-step-${String(step)}`,
    kind: 'guided-project',
    title: `共有workspace 工程${String(step)}`,
    prerequisiteLessonIds: step === 1 ? [] : ['lesson-guided-step-1'],
    ...(step === 1 ? { nextLessonId: 'lesson-guided-step-2' } : {}),
    slides: [slide],
    exercises: [exercise],
    project: {
      id: PROJECT_ID,
      brief: [{ type: 'paragraph', text: '同じSourceを次の工程へ積み重ねます。' }],
      guide: [],
      checklist: [
        {
          id: checklistId,
          label: `工程${String(step)}を完成する`,
          required: true,
          ruleIds: [ruleId],
        },
      ],
    },
    completion: {
      kind: 'guided-project',
      requiredChecklistItemIds: [checklistId],
      requiredExerciseIds: [exerciseId],
    },
  };
}

const source = structuredClone(fixtureCourse);
const sourcePhase = source.phases[0]!;
const sourceChapter = sourcePhase.chapters[0]!;
const sourceLesson = sourceChapter.lessons[0] as StandardLesson;

export const guidedWorkspaceCourse: CourseManifest = CourseManifestSchema.parse({
  ...source,
  publicationStatus: 'draft',
  title: 'Guided Workspace Runtime Fixture',
  description: '共有workspaceの統合契約だけを検証する非公開Course',
  estimatedMinutes: 30,
  glossary: source.glossary.map((entry) => ({
    ...entry,
    firstSlideId: 'slide-guided-step-1',
  })),
  expectedTotals: {
    chapters: 1,
    lessons: 2,
    conceptSlides: 2,
    standardExercises: 0,
    guidedProjectLessons: 2,
    capstoneLessons: 0,
    estimatedMinutes: 30,
  },
  phases: [
    {
      ...sourcePhase,
      chapters: [
        {
          ...sourceChapter,
          kind: 'guided-project',
          estimatedMinutes: 30,
          lessons: [createGuidedStep(sourceLesson, 1), createGuidedStep(sourceLesson, 2)],
        },
      ],
    },
  ],
});
