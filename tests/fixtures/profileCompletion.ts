/** 実Profile教材から、同じ編集revisionで全工程に合格した保存状態を作る。 */
import catalogSource from '../../public/generated/content/catalog-v3.json?raw';
import indexSource from '../../public/generated/content/courses/html-css/index.json?raw';
import firstSource from '../../public/generated/content/courses/html-css/lessons/html-css-ch12-l01.json?raw';
import secondSource from '../../public/generated/content/courses/html-css/lessons/html-css-ch12-l02.json?raw';
import thirdSource from '../../public/generated/content/courses/html-css/lessons/html-css-ch12-l03.json?raw';
import fourthSource from '../../public/generated/content/courses/html-css/lessons/html-css-ch12-l04.json?raw';
import fifthSource from '../../public/generated/content/courses/html-css/lessons/html-css-ch12-l05.json?raw';
import {
  CourseCatalogV3Schema,
  CourseIndexSchema,
  LessonManifestSchema,
} from '../../src/core/content/deliverySchema';
import { exerciseRequirementIds } from '../../src/core/content/exerciseRequirementIds';
import type { CourseProgress, ExerciseDraft } from '../../src/core/persistence/contracts';

const NOW = '2026-10-16T00:00:00.000Z';

/** 指定工程までの共有snapshotと、独立に失効させられる工程別進捗を返す。 */
export function profileCompletionFixture(stageIndex = 4) {
  const catalog = CourseCatalogV3Schema.parse(JSON.parse(catalogSource));
  const course = CourseIndexSchema.parse(JSON.parse(indexSource));
  const manifests = [firstSource, secondSource, thirdSource, fourthSource, fifthSource].map(
    (source) => LessonManifestSchema.parse(JSON.parse(source)),
  );
  const lesson = manifests[stageIndex]!.lesson;
  const exercise = lesson.exercises[0]!;
  const files = Object.fromEntries(exercise.files.map(({ path, content }) => [path, content]));
  const progress: CourseProgress = {
    courseId: course.id,
    contentRevision: course.revision,
    lessons: Object.fromEntries(
      manifests.map(({ lesson: item }) => [
        item.id,
        {
          lessonId: item.id,
          viewedSlideIds: [],
          passedExerciseIds: item.exercises.map(({ id }) => id),
          passedChecklistItemIds:
            item.kind === 'guided-project' ? item.completion.requiredChecklistItemIds : [],
          passedRuleIds: item.exercises.flatMap(exerciseRequirementIds),
          passedViewportIds: exercise.previewViewports.map(({ id }) => id),
          currentComplete: true,
        },
      ]),
    ),
    currentComplete: false,
    updatedAt: NOW,
  };
  const draft: ExerciseDraft = {
    courseId: course.id,
    lessonId: lesson.id,
    exerciseId: exercise.id,
    workspaceId: exercise.workspaceId,
    contentRevision: course.revision,
    editRevision: 1,
    files,
    selectedFile: 'index.html',
    cursors: {},
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: Object.fromEntries(
      manifests
        .slice(0, stageIndex + 1)
        .flatMap(({ lesson: item }) =>
          item.exercises.map(({ id }) => [
            id,
            { editRevision: 1, contentRevision: course.revision, files, evaluatedAt: NOW },
          ]),
        ),
    ),
    updatedAt: NOW,
  };
  return { catalog, course, manifests, lesson, exercise, progress, draft };
}
