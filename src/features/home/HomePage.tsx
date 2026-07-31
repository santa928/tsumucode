import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLoaderData, useLocation } from 'react-router-dom';
import type { homeLoader } from '../../app/contentLoaders';
import type { CourseCatalogEntry } from '../../core/content/types';
import { ActionLink } from '../../design-system/components/ActionLink';
import { PieceProgress } from '../../design-system/components/PieceProgress';
import { StackedCard } from '../../design-system/components/StackedCard';
import { WorkshopNotice } from '../../design-system/components/WorkshopNotice';
import { summarizeCatalogCourseProgress } from '../progress/catalogCourseProgress';
import { useCourseProgress } from '../progress/useCourseProgress';

const ProgressTransferPanel = lazy(() =>
  import('../progress/ProgressTransferPanel').then(({ ProgressTransferPanel: Panel }) => ({
    default: Panel,
  })),
);

const DEVICE_DATA_TOOLS_DELAY_MS = 250;

/** 初回主要描画を優先し、明示focus時だけ端末データ道具箱を即時表示する。 */
function useDeferredDeviceDataTools(loadImmediately: boolean): boolean {
  const [delayElapsed, setDelayElapsed] = useState(false);
  useEffect(() => {
    if (loadImmediately || delayElapsed) return;
    const timeout = window.setTimeout(() => {
      setDelayElapsed(true);
    }, DEVICE_DATA_TOOLS_DELAY_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [delayElapsed, loadImmediately]);
  return loadImmediately || delayElapsed;
}

/** 1 CourseのCatalog metadataと保存済み進捗から主要導線を組み立てる。 */
function CourseShelfCard({ course }: { readonly course: CourseCatalogEntry }) {
  const courseProgress = useCourseProgress(course.id);
  const progressSummary = summarizeCatalogCourseProgress(
    course,
    courseProgress.status === 'ready' ? courseProgress.progress : undefined,
  );
  const actionLabel =
    progressSummary.status === 'complete'
      ? `${course.title}：完成したコースを見直す`
      : progressSummary.status === 'revision-mismatch'
        ? `${course.title}：教材の更新を確認する`
        : progressSummary.status === 'in-progress'
          ? `${course.title}：つづきから`
          : `${course.title}：最初のピースを置く`;
  const titleId = `course-title-${course.id}`;

  return (
    <StackedCard
      as="article"
      aria-labelledby={titleId}
      className="flex h-full flex-col overflow-hidden bg-workshop-raised p-0"
    >
      <div aria-hidden="true" className="flex h-4 gap-1 bg-workshop-workbench p-1">
        <span className="w-1/4 rounded-workshop-piece bg-workshop-learning" />
        <span className="w-2/5 rounded-workshop-piece bg-workshop-complete" />
        <span className="flex-1 rounded-workshop-piece bg-workshop-wood" />
      </div>
      <div className="flex flex-1 flex-col p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex rounded-workshop-sm bg-workshop-learning px-3 py-1 text-sm font-bold">
            公開中
          </span>
          <span className="rounded-workshop-sm bg-workshop-workbench px-3 py-1 text-sm font-bold">
            {course.estimatedMinutes}分
          </span>
        </div>
        <h3 id={titleId} className="mt-5 text-2xl font-black md:text-3xl">
          {course.title}
        </h3>
        <p className="mt-3 text-workshop-muted">{course.description}</p>
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-workshop-border pt-5">
          <dt className="font-bold">対象</dt>
          <dd>{course.audience}</dd>
          <dt className="font-bold">進め方</dt>
          <dd>スライドとコード実習</dd>
        </dl>
        <PieceProgress
          className="mt-6"
          completed={progressSummary.completedLessons}
          total={progressSummary.totalLessons}
          label={`${course.title}の進捗`}
        />
        {courseProgress.status === 'loading' ? (
          <p role="status" className="mt-4 text-sm font-bold text-workshop-muted">
            この端末の続き位置を確認しています。
          </p>
        ) : null}
        {courseProgress.status === 'error' ? (
          <WorkshopNotice tone="correction" title="続き位置を読み込めませんでした" className="mt-4">
            <p>{courseProgress.error}</p>
            <button
              type="button"
              onClick={courseProgress.retry}
              className="mt-3 min-h-11 rounded-workshop-sm border-2 border-workshop-primary px-3 py-2 font-bold text-workshop-primary"
            >
              もう一度確認する
            </button>
          </WorkshopNotice>
        ) : null}
        {progressSummary.status === 'revision-mismatch' ? (
          <WorkshopNotice tone="neutral" title="教材が更新されています" className="mt-4">
            <p>コースマップを開くと、この端末の続き位置を新しい教材へ合わせます。</p>
          </WorkshopNotice>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-3 pt-7">
          <ActionLink to={progressSummary.actionPath} className="w-full sm:w-auto">
            {actionLabel}
          </ActionLink>
          <Link
            to={`/library/${course.id}`}
            aria-label={`${course.title}：スライドだけ見る`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-workshop-md border-2 border-workshop-primary px-5 py-3 font-bold text-workshop-primary sm:w-auto"
          >
            スライドだけ見る
          </Link>
        </div>
      </div>
    </StackedCard>
  );
}

/** 公開Courseを対象者・所要時間・再開地点が分かる学習ピースとして表示する。 */
export function HomePage() {
  const { publishedCourses } = useLoaderData<typeof homeLoader>();
  const location = useLocation();
  const showDeviceDataTools = useDeferredDeviceDataTools(
    new URLSearchParams(location.search).get('focus') === 'device-data',
  );

  return (
    <section aria-labelledby="catalog-title">
      <header className="max-w-3xl">
        <p className="font-bold text-workshop-complete">積み木の学習工房</p>
        <h1 id="catalog-title" className="mt-2 text-4xl font-black md:text-5xl">
          学びたいピースを選ぶ
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-workshop-muted">
          スライドで仕組みを理解して、ブラウザ上のコードで確かめます。学習の記録はこの端末へ保存されます。
        </p>
      </header>

      <section className="mt-10" aria-labelledby="course-shelf-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-workshop-muted">工房の教材棚</p>
            <h2 id="course-shelf-title" className="mt-1 text-2xl font-black">
              次に積む教材
            </h2>
          </div>
          <p className="text-sm text-workshop-muted">公開中 {publishedCourses.length}件</p>
        </div>

        {publishedCourses.length === 0 ? (
          <StackedCard className="mt-5 max-w-2xl bg-workshop-raised">
            <p role="status" className="font-bold">
              公開中の教材を準備しています。
            </p>
            <p className="mt-2 text-workshop-muted">新しいピースが整うまで、少しお待ちください。</p>
          </StackedCard>
        ) : (
          <ul className="mt-5 grid list-none gap-7 p-0 lg:grid-cols-2">
            {publishedCourses.map((course) => {
              return (
                <li key={course.id}>
                  <CourseShelfCard course={course} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {showDeviceDataTools ? (
        <Suspense
          fallback={
            <p role="status" className="mt-10 font-bold text-workshop-muted">
              端末データの道具箱を確認しています。
            </p>
          }
        >
          <ProgressTransferPanel />
        </Suspense>
      ) : (
        <p role="status" className="mt-10 font-bold text-workshop-muted">
          端末データの道具箱を確認しています。
        </p>
      )}
    </section>
  );
}
