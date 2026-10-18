import { useMemo } from 'react';
import { useLoaderData } from 'react-router';
import type { courseLoader } from '../../app/contentLoaders';
import { buildCourseMap } from '../../core/content/courseMap';
import { lessonResumePath, lessonStartTargetPath } from '../../core/content/lessonStart';
import { ActionLink } from '../../design-system/components/ActionLink';
import { PieceProgress } from '../../design-system/components/PieceProgress';
import { StackedCard } from '../../design-system/components/StackedCard';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { WorkshopNotice } from '../../design-system/components/WorkshopNotice';
import { applyCourseProgress } from '../progress/courseMapProgress';
import { useCourseProgress } from '../progress/useCourseProgress';
import { findLessonResumeDraft, lessonReadingTarget } from '../progress/lessonResumeTarget';
import { sharedGuidedProjectStages } from '../progress/sharedGuidedProjectStages';
import { useEditingCapability } from '../../shared/device/editingCapability';

const KIND_LABEL = {
  standard: '基礎レッスン',
  'guided-project': '一緒に作る',
  capstone: '仕上げ制作',
} as const;

/** Courseの現在進捗を示し、以前の達成記録と現在のコードの再判定を区別する。 */
export function CourseMapPage() {
  const course = useLoaderData<typeof courseLoader>();
  const canEdit = useEditingCapability();
  const lessons = useMemo(
    () => course.phases.flatMap(({ chapters }) => chapters.flatMap(({ lessons: items }) => items)),
    [course],
  );
  const workspaceIds = useMemo(
    () => [
      ...new Set(
        lessons.flatMap(({ exercises }) => exercises.map(({ workspaceId }) => workspaceId)),
      ),
    ],
    [lessons],
  );
  const sharedProjects = useMemo(() => sharedGuidedProjectStages(course), [course]);
  const sharedStageIds = new Set(
    sharedProjects.flatMap(({ lessons: stages }) => stages.map(({ id }) => id)),
  );
  const courseProgress = useCourseProgress(course.id, undefined, workspaceIds);
  const readingTargets = new Map(
    lessons.map((lesson) => [
      lesson.id,
      canEdit ? undefined : lessonReadingTarget(course, lesson, courseProgress.progress),
    ]),
  );
  const draftLessonTimes = new Map<string, string>();
  if (courseProgress.drafts !== undefined) {
    for (const lesson of lessons) {
      const draft = findLessonResumeDraft(
        course,
        lesson,
        courseProgress.progress,
        courseProgress.drafts,
      );
      if (draft !== undefined) draftLessonTimes.set(lesson.id, draft.updatedAt);
    }
  }
  const map = applyCourseProgress(
    buildCourseMap(course),
    courseProgress.progress,
    course.revision,
    draftLessonTimes,
  );

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
        {!canEdit ? (
          <p className="mt-4 max-w-2xl text-workshop-muted">
            解説の閲覧位置と、演習の合格記録は別です。保存した閲覧位置があれば、そこから解説を開きます。演習は編集できるPCで取り組めます。
          </p>
        ) : null}
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
                              CHAPTER {String(chapter.sequence).padStart(2, '0')}・
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
                        {sharedProjects
                          .filter(({ lessons: stages }) =>
                            chapter.lessons.some(({ id }) => id === stages[0]!.id),
                          )
                          .map(({ workspaceId, lessons: stages }) => {
                            const unfinished = stages.filter(
                              ({ id }) =>
                                courseProgress.progress?.lessons[id]?.currentComplete !== true,
                            );
                            return (
                              <div
                                key={workspaceId}
                                className="mt-4 space-y-2 text-sm text-workshop-muted"
                              >
                                <p>
                                  「工程合格」はその工程の条件を満たした記録です。制作全体は最終工程で全工程をまとめて判定します。
                                </p>
                                {courseProgress.status === 'ready' ? (
                                  unfinished.length > 0 ? (
                                    <>
                                      <p className="font-bold">制作全体は未完了です。</p>
                                      <p>
                                        未合格の工程：
                                        {unfinished.map(({ title }) => title).join('、')}
                                      </p>
                                    </>
                                  ) : (
                                    <p>
                                      全工程に合格記録があります。制作全体の完成は最終工程の判定結果で確認してください。
                                    </p>
                                  )
                                ) : null}
                              </div>
                            );
                          })}
                      </header>

                      <ol className="list-none p-5 md:p-7">
                        {chapter.lessons.map((lesson, lessonIndex) => {
                          const readingTarget = readingTargets.get(lesson.id);
                          const resumesLesson =
                            lesson.status !== 'complete' &&
                            (draftLessonTimes.has(lesson.id) ||
                              (lesson.status === 'current' &&
                                courseProgress.progress !== undefined));
                          const lessonPath =
                            readingTarget !== undefined
                              ? lessonStartTargetPath(course.id, lesson.id, readingTarget)
                              : resumesLesson
                                ? lessonResumePath(course.id, lesson.id)
                                : lesson.startPath;
                          const lessonLabel =
                            readingTarget !== undefined
                              ? `${lesson.title}の解説を読む`
                              : resumesLesson
                                ? `${lesson.title}レッスンを再開する`
                                : lesson.status === 'current'
                                  ? `${lesson.title}レッスンを始める`
                                  : `${lesson.title}レッスンを見る`;
                          return (
                            <li
                              key={lesson.id}
                              data-lesson-piece
                              className="group grid grid-cols-1 gap-3 pb-6 last:pb-0 sm:grid-cols-[2.5rem_minmax(0,1fr)] md:grid-cols-[3rem_minmax(0,1fr)] md:gap-5"
                            >
                              <div
                                aria-hidden="true"
                                className="relative flex justify-start sm:justify-center"
                              >
                                <span className="absolute bottom-[-1.5rem] top-10 hidden w-1 bg-workshop-workbench group-last:hidden sm:block" />
                                <span className="relative grid size-10 place-items-center rounded-workshop-piece border-2 border-workshop-primary bg-workshop-canvas font-black text-workshop-primary shadow-[var(--tc-shadow-piece)]">
                                  {lessonIndex + 1}
                                </span>
                              </div>
                              <div className="min-w-0 rounded-workshop-md border border-workshop-border bg-workshop-raised p-4 [overflow-wrap:anywhere] md:p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <StatusBadge
                                      status={lesson.status}
                                      {...(lesson.status === 'complete' &&
                                      sharedStageIds.has(lesson.id)
                                        ? { label: '工程合格' }
                                        : {})}
                                    />
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
                                {courseProgress.progress?.lessons[lesson.id]?.firstCompletedAt !==
                                  undefined &&
                                courseProgress.progress.lessons[lesson.id]?.currentComplete ===
                                  false ? (
                                  <p className="mt-3 text-sm text-workshop-muted">
                                    以前の達成記録は残っています。現在のコードを、もう一度「判定する」で確認してください。
                                  </p>
                                ) : null}
                                <div className="mt-5">
                                  {!canEdit && courseProgress.status === 'loading' ? (
                                    <p className="min-h-11 text-sm text-workshop-muted">
                                      閲覧位置を確認しています。
                                    </p>
                                  ) : (
                                    <ActionLink to={lessonPath} className="w-full sm:w-auto">
                                      {lessonLabel}
                                    </ActionLink>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
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
