/** 端末能力に応じて編集Runtimeまたは閲覧専用画面だけを遅延読込する。 */
import { lazy, Suspense } from 'react';
import { useLoaderData } from 'react-router-dom';
import type { exerciseLoader } from '../../../app/contentLoaders';
import { WorkspaceLeaseGate } from '../../progress/WorkspaceLeaseGate';
import { WorkshopNotice } from '../../../design-system/components/WorkshopNotice';
import { useEditingCapability } from '../../../shared/device/editingCapability';
import { learningRuntimeServices } from '../runtimeServices';
import { ReadOnlyExercisePage } from './ReadOnlyExercisePage';

const LazyEditableExercisePage = lazy(() =>
  import('./EditableExercisePage').then((module) => ({
    default: module.EditableExercisePage,
  })),
);

/** 編集Runtimeの遅延読込中も、作業内容ではなく画面準備中だと明示する。 */
function ExerciseLoadingNotice() {
  return (
    <div role="status">
      <WorkshopNotice tone="neutral" title="演習画面を準備しています">
        コードエディターとプレビューの作業台を読み込んでいます。
      </WorkshopNotice>
    </div>
  );
}

/** 小画面ではCodeMirror moduleを評価せず、現在進捗に応じた案内を返す。 */
export function ExercisePage() {
  const data = useLoaderData<typeof exerciseLoader>();
  const canEdit = useEditingCapability();
  const sessionKey = `${data.course.id}:${data.course.revision}:${data.exercise.id}:${data.exercise.workspaceId}`;
  if (!canEdit) {
    return (
      <div data-exercise-mode="read-only">
        <ReadOnlyExercisePage key={sessionKey} {...data} />
      </div>
    );
  }
  return (
    <div data-exercise-mode="editable">
      <WorkspaceLeaseGate
        key={sessionKey}
        courseId={data.course.id}
        workspaceId={data.exercise.workspaceId}
        coordinator={learningRuntimeServices.leaseCoordinator}
      >
        {(lease) => (
          <Suspense fallback={<ExerciseLoadingNotice />}>
            <LazyEditableExercisePage {...data} lease={lease} />
          </Suspense>
        )}
      </WorkspaceLeaseGate>
    </div>
  );
}
