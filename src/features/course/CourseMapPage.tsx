import { useLoaderData } from 'react-router-dom';
import type { courseLoader } from '../../app/contentLoaders';
import { buildCourseMap } from '../../core/content/courseMap';
import { ActionLink } from '../../design-system/components/ActionLink';
import { PieceProgress } from '../../design-system/components/PieceProgress';
import { StackedCard } from '../../design-system/components/StackedCard';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { WorkshopNotice } from '../../design-system/components/WorkshopNotice';
import { applyCourseProgress } from '../progress/courseMapProgress';
import { useCourseProgress } from '../progress/useCourseProgress';

const KIND_LABEL = {
  standard: '基礎レッスン',
  'guided-project': '一緒に作る',
  capstone: '仕上げ制作',
} as const;

/** Phase、Chapter、Lessonの関係を、組み立て順が見えるコースマップとして表示する。 */
export function CourseMapPage() {
  const course = useLoaderData<typeof courseLoader>();
  const courseProgress = useCourseProgress(course.id);
  const map = applyCourseProgress(buildCourseMap(course), courseProgress.progress, course.revision);

  return (
    <article data-course-map aria-labelledby="course-map-title">
      <header className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-workshop-sm bg-workshop-workbench px-3 py-1.5 text-sm font-bold text-workshop-muted">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-workshop-piece bg-workshop-learning"
          />
          コースの設計図
        </div>
        <h1 id="course-map-title" className="mt-4 text-4xl font-black md:text-5xl">
          {map.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-workshop-muted">{map.description}</p>
        <p className="mt-4 font-bold text-workshop-muted">
          全{course.expectedTotals.chapters}章・約{map.estimatedMinutes}分
        </p>
        <div className="mt-6 rounded-workshop-md border border-workshop-border bg-workshop-raised p-4">
          <div data-testid="course-progress-status" className="min-h-6">
            {courseProgress.status === 'loading' ? (
              <p role="status" className="text-sm font-bold text-workshop-muted">
                端末のコース進捗を確認しています。
              </p>
            ) : null}
            {courseProgress.status === 'error' ? (
              <div role="alert">
                <WorkshopNotice tone="correction" title="進捗を読み込めませんでした">
                  <p>{courseProgress.error}</p>
                  <button
                    type="button"
                    onClick={courseProgress.retry}
                    className="mt-3 min-h-11 rounded-workshop-md border-2 border-workshop-primary px-4 py-2 font-bold text-workshop-primary"
                  >
                    コース進捗を再試行
                  </button>
                </WorkshopNotice>
              </div>
            ) : null}
          </div>
          <PieceProgress
            className="mt-4"
            completed={map.completedLessons}
            total={map.totalLessons}
            label="コース進捗"
          />
        </div>
      </header>

      <div className="mt-12 space-y-14">
        {map.phases.map((phase, phaseIndex) => {
          const phaseTitleId = `phase-title-${phase.id}`;
          return (
            <section key={phase.id} aria-labelledby={phaseTitleId}>
              <header className="grid gap-3 border-l-4 border-workshop-learning pl-4 md:grid-cols-[auto_1fr] md:items-start md:gap-5 md:pl-5">
                <span className="inline-flex w-fit rounded-workshop-sm bg-workshop-learning px-3 py-1 text-sm font-black">
                  PHASE {phaseIndex + 1}
                </span>
                <div>
                  <h2 id={phaseTitleId} className="text-3xl font-black">
                    {phase.title}
                  </h2>
                  <p className="mt-2 text-workshop-muted">{phase.description}</p>
                </div>
              </header>

              <div className="mt-7 space-y-8">
                {phase.chapters.map((chapter) => {
                  const chapterTitleId = `chapter-title-${chapter.id}`;
                  return (
                    <StackedCard
                      key={chapter.id}
                      as="section"
                      data-chapter-card
                      aria-labelledby={chapterTitleId}
                      className="overflow-hidden bg-workshop-surface p-0"
                    >
                      <div aria-hidden="true" className="flex h-3 gap-1 bg-workshop-workbench p-1">
                        <span className="w-1/5 rounded-workshop-piece bg-workshop-wood" />
                        <span className="w-2/5 rounded-workshop-piece bg-workshop-complete" />
                        <span className="flex-1 rounded-workshop-piece bg-workshop-learning" />
                      </div>
                      <header className="border-b border-workshop-border p-5 md:p-7">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-black text-workshop-complete">
                              CHAPTER {String(chapter.sequence + 1).padStart(2, '0')}・
                              {KIND_LABEL[chapter.kind]}
                            </p>
                            <h3
                              id={chapterTitleId}
                              className="mt-2 text-2xl font-black md:text-3xl"
                            >
                              {chapter.title}
                            </h3>
                          </div>
                          <span className="rounded-workshop-sm bg-workshop-workbench px-3 py-1.5 text-sm font-bold">
                            約{chapter.estimatedMinutes}分
                          </span>
                        </div>
                        <p className="mt-4 text-workshop-muted">
                          <span className="font-bold text-workshop-ink">
                            できるようになること：
                          </span>
                          {chapter.goal}
                        </p>
                      </header>

                      <ol className="list-none p-5 md:p-7">
                        {chapter.lessons.map((lesson, lessonIndex) => (
                          <li
                            key={lesson.id}
                            data-lesson-piece
                            className="group grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 pb-6 last:pb-0 md:grid-cols-[3rem_minmax(0,1fr)] md:gap-5"
                          >
                            <div aria-hidden="true" className="relative flex justify-center">
                              <span className="absolute bottom-[-1.5rem] top-10 w-1 bg-workshop-workbench group-last:hidden" />
                              <span className="relative grid size-10 place-items-center rounded-workshop-piece border-2 border-workshop-primary bg-workshop-canvas font-black text-workshop-primary shadow-[var(--tc-shadow-piece)]">
                                {lessonIndex + 1}
                              </span>
                            </div>
                            <div className="min-w-0 rounded-workshop-md border border-workshop-border bg-workshop-raised p-4 md:p-5">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <StatusBadge status={lesson.status} />
                                  <h4 className="mt-3 text-xl font-black">{lesson.title}</h4>
                                </div>
                                <span
                                  data-lesson-minutes
                                  className="rounded-workshop-sm bg-workshop-workbench px-3 py-1 text-sm font-bold"
                                >
                                  {lesson.estimatedMinutes}分
                                </span>
                              </div>
                              <p className="mt-3 text-workshop-muted">{lesson.goal}</p>
                              <div className="mt-5">
                                <ActionLink to={lesson.startPath} className="w-full sm:w-auto">
                                  {lesson.status === 'current'
                                    ? `${lesson.title}レッスンを始める`
                                    : `${lesson.title}レッスンを見る`}
                                </ActionLink>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </StackedCard>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}
