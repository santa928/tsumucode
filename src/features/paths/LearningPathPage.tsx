/** 公開LearningPathを順序付きCourse一覧として表示する通常学習Page。 */
import { Link, useLoaderData } from 'react-router';
import type { learningPathLoader } from '../../app/contentLoaders';
import { ActionLink } from '../../design-system/components/ActionLink';
import { PieceProgress } from '../../design-system/components/PieceProgress';
import { StackedCard } from '../../design-system/components/StackedCard';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { WorkshopNotice } from '../../design-system/components/WorkshopNotice';
import type { CatalogCourseProgressSummary } from '../progress/catalogCourseProgress';
import { summarizeLearningPathProgress } from '../progress/learningPathProgress';
import { useLearningPathProgress } from '../progress/useLearningPathProgress';
import { learningPathActionLabel } from './learningPathLabels';

/** Course状態を直接学習Linkの日本語へ変換する。 */
function courseActionLabel(title: string, status: CatalogCourseProgressSummary['status']): string {
  switch (status) {
    case 'not-started':
      return `${title}を始める`;
    case 'in-progress':
      return `${title}のつづきから`;
    case 'complete':
      return `${title}を見直す`;
    case 'revision-mismatch':
      return `${title}の更新を確認する`;
  }
}

/** Catalog Course状態を既存StatusBadgeの3段階へ投影する。 */
function courseBadgeStatus(
  status: CatalogCourseProgressSummary['status'],
): 'complete' | 'current' | 'not-started' {
  if (status === 'complete') return 'complete';
  if (status === 'not-started') return 'not-started';
  return 'current';
}

/** Loaderで検証済みのPath metadataと読取専用進捗を組み立て順として表示する。 */
export function LearningPathPage() {
  const { path, courses } = useLoaderData<typeof learningPathLoader>();
  const progress = useLearningPathProgress(path, courses);
  const fallbackSummary = summarizeLearningPathProgress(path, courses, new Map());
  const summary = progress.summary;
  const steps = summary?.steps ?? fallbackSummary.steps;
  const courseTitleById = new Map(courses.map((course) => [course.id, course.title] as const));

  return (
    <article aria-labelledby="learning-path-title">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-workshop-sm py-2 font-bold text-workshop-primary underline decoration-2 underline-offset-4"
      >
        ← 教材一覧へ
      </Link>

      <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
        <header className="max-w-3xl">
          <p className="font-bold text-workshop-complete">学習パスの設計図</p>
          <h1 id="learning-path-title" className="mt-2 text-4xl font-black md:text-5xl">
            {path.title}
          </h1>
          <p className="mt-4 text-lg text-workshop-muted">{path.description}</p>
          <p className="mt-4 max-w-2xl font-bold text-workshop-muted">
            公開済みのコースから順に学べます。新しい教材は完成後にこのパスへ追加されます。
          </p>
        </header>

        <StackedCard
          as="section"
          aria-label={`${path.title}の現在地`}
          className="bg-workshop-raised"
        >
          <p className="text-sm font-black text-workshop-complete">現在の組み立て位置</p>
          {progress.status === 'loading' ? (
            <p role="status" className="mt-3 font-bold text-workshop-muted">
              この端末の学習パス進捗を確認しています。
            </p>
          ) : null}
          {progress.status === 'error' ? (
            <WorkshopNotice tone="correction" title="進捗を読み込めませんでした" className="mt-3">
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
          {progress.status === 'ready' && summary !== undefined ? (
            <>
              <PieceProgress
                className="mt-4"
                completed={summary.completedRequiredCourses}
                total={summary.totalRequiredCourses}
                label="必須コースの進捗"
              />
              <ActionLink to={summary.actionPath} className="mt-6 w-full" dataPathPrimaryAction>
                {learningPathActionLabel(path.title, summary.status)}
              </ActionLink>
            </>
          ) : null}
        </StackedCard>
      </div>

      <section className="mt-12" aria-labelledby="learning-path-steps-title">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-workshop-muted">設計図の読み方</p>
          <h2 id="learning-path-steps-title" className="mt-1 text-3xl font-black">
            コースの組み立て順
          </h2>
          <p className="mt-3 text-workshop-muted">
            順番は目安です。どのコースもロックされず、気になるピースから始められます。
          </p>
        </div>

        <ol aria-label="学習パスのコース順" className="mt-7 list-none space-y-6 p-0">
          {steps.map((step, index) => {
            const titleId = `learning-path-step-${step.course.id}`;
            const prerequisiteTitles = step.prerequisiteCourseIds.map((courseId) => {
              const title = courseTitleById.get(courseId);
              if (title === undefined) {
                throw new Error(`前提Courseの表示名が見つかりません: ${courseId}`);
              }
              return title;
            });
            return (
              <li
                key={step.course.id}
                data-learning-path-step
                className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 md:grid-cols-[4rem_minmax(0,1fr)] md:gap-5"
              >
                <div aria-hidden="true" className="relative flex justify-center">
                  <span
                    className={`absolute bottom-[-1.5rem] top-12 w-1 rounded-workshop-piece bg-workshop-workbench ${
                      index === steps.length - 1 ? 'hidden' : ''
                    }`}
                  />
                  <span className="relative grid size-12 place-items-center rounded-workshop-piece border-2 border-workshop-primary bg-workshop-canvas font-mono text-lg font-black text-workshop-primary shadow-[var(--tc-shadow-piece)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <StackedCard as="article" aria-labelledby={titleId} className="bg-workshop-surface">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-path-role-badge
                        className={`inline-flex rounded-workshop-sm px-3 py-1 text-sm font-black ${
                          step.role === 'required'
                            ? 'bg-workshop-primary text-workshop-on-primary'
                            : 'bg-workshop-learning text-workshop-ink'
                        }`}
                      >
                        {step.role === 'required' ? '必須' : '選択'}
                      </span>
                      <StatusBadge status={courseBadgeStatus(step.courseProgress.status)} />
                    </div>
                    <span className="rounded-workshop-sm bg-workshop-workbench px-3 py-1 text-sm font-bold">
                      約{step.course.estimatedMinutes}分
                    </span>
                  </div>
                  <h3 id={titleId} className="mt-4 text-2xl font-black md:text-3xl">
                    {step.course.title}
                  </h3>
                  <p className="mt-3 text-workshop-muted">{step.course.description}</p>
                  <p className="mt-4 text-sm font-bold text-workshop-muted">
                    前提コース：
                    {prerequisiteTitles.length === 0 ? 'なし' : prerequisiteTitles.join('、')}
                  </p>
                  <PieceProgress
                    className="mt-5"
                    completed={step.courseProgress.completedLessons}
                    total={step.courseProgress.totalLessons}
                    label={`${step.course.title}の進捗`}
                    compact
                  />
                  <div className="mt-6 flex flex-wrap gap-3">
                    <ActionLink to={step.courseProgress.actionPath} className="w-full sm:w-auto">
                      {courseActionLabel(step.course.title, step.courseProgress.status)}
                    </ActionLink>
                    <Link
                      to={`/library/${step.course.id}`}
                      aria-label={`${step.course.title}：スライドだけ見る`}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-workshop-md border-2 border-workshop-primary px-5 py-3 font-bold text-workshop-primary sm:w-auto"
                    >
                      スライドだけ見る
                    </Link>
                  </div>
                </StackedCard>
              </li>
            );
          })}
        </ol>
      </section>
    </article>
  );
}
