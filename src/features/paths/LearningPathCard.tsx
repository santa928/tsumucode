/** HomeでLearningPathの役割・進捗・次のrequired Courseを一枚にまとめる。 */
import { Link } from 'react-router-dom';
import type { CourseCatalogEntry, LearningPathDefinition } from '../../core/content/types';
import { ActionLink } from '../../design-system/components/ActionLink';
import { PieceProgress } from '../../design-system/components/PieceProgress';
import { StackedCard } from '../../design-system/components/StackedCard';
import { WorkshopNotice } from '../../design-system/components/WorkshopNotice';
import { useLearningPathProgress } from '../progress/useLearningPathProgress';
import { learningPathActionLabel } from './learningPathLabels';

interface LearningPathCardProps {
  readonly path: LearningPathDefinition;
  readonly courses: readonly CourseCatalogEntry[];
}

/** Pathの各Stepを上端の積み木色へ変換する。 */
function stepPieceColor(role: LearningPathDefinition['steps'][number]['role'], index: number) {
  if (role === 'recommended') return 'bg-workshop-learning';
  return index === 0 ? 'bg-workshop-complete' : 'bg-workshop-primary';
}

/** Path進捗を一度だけ購読し、Homeの主要な学習開始カードとして表示する。 */
export function LearningPathCard({ path, courses }: LearningPathCardProps) {
  const progress = useLearningPathProgress(path, courses);
  const requiredCourses = path.steps.filter(({ role }) => role === 'required').length;
  const titleId = `learning-path-card-${path.id}`;

  return (
    <StackedCard
      as="article"
      aria-labelledby={titleId}
      className="flex h-full flex-col overflow-hidden bg-workshop-raised p-0"
    >
      <div
        aria-hidden="true"
        className="grid h-4 grid-flow-col auto-cols-fr gap-1 bg-workshop-workbench p-1"
      >
        {path.steps.map((step, index) => (
          <span
            key={step.courseId}
            className={`rounded-workshop-piece ${stepPieceColor(step.role, index)}`}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex rounded-workshop-sm bg-workshop-complete px-3 py-1 text-sm font-bold text-workshop-on-primary">
            おすすめの組み立て順
          </span>
          <span className="rounded-workshop-sm bg-workshop-workbench px-3 py-1 text-sm font-bold">
            必須コース {requiredCourses}件
          </span>
        </div>
        <h3 id={titleId} className="mt-5 text-2xl font-black md:text-3xl">
          {path.title}
        </h3>
        <p className="mt-3 text-workshop-muted">{path.description}</p>

        {progress.status === 'loading' ? (
          <p role="status" className="mt-6 font-bold text-workshop-muted">
            この端末の学習パス進捗を確認しています。
          </p>
        ) : null}
        {progress.status === 'error' ? (
          <WorkshopNotice tone="correction" title="進捗を読み込めませんでした" className="mt-6">
            <p>{progress.error}</p>
            <button
              type="button"
              onClick={progress.retry}
              className="mt-3 min-h-11 rounded-workshop-md border-2 border-workshop-primary px-4 py-2 font-bold text-workshop-primary"
            >
              学習パス進捗を再試行
            </button>
          </WorkshopNotice>
        ) : null}
        {progress.status === 'ready' && progress.summary !== undefined ? (
          <>
            <PieceProgress
              className="mt-6"
              completed={progress.summary.completedRequiredCourses}
              total={progress.summary.totalRequiredCourses}
              label={`${path.title}の進捗`}
            />
            <div className="mt-auto flex flex-wrap gap-3 pt-7">
              <ActionLink to={progress.summary.actionPath} className="w-full sm:w-auto">
                {learningPathActionLabel(path.title, progress.summary.status)}
              </ActionLink>
              <Link
                to={`/paths/${path.id}`}
                aria-label={`${path.title}の全体を見る`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-workshop-md border-2 border-workshop-primary px-5 py-3 font-bold text-workshop-primary sm:w-auto"
              >
                組み立て順を見る
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-auto pt-7">
            <Link
              to={`/paths/${path.id}`}
              aria-label={`${path.title}の全体を見る`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-workshop-md border-2 border-workshop-primary px-5 py-3 font-bold text-workshop-primary sm:w-auto"
            >
              組み立て順を見る
            </Link>
          </div>
        )}
      </div>
    </StackedCard>
  );
}
