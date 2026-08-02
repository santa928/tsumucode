/** 現在も完了条件を満たすExerciseだけに表示する達成画面。 */
import { Link, useLoaderData } from 'react-router';
import type { completionLoader } from '../../../app/contentLoaders';
import { lessonStartPath } from '../../../core/content/courseMap';
import { findLesson } from '../../../core/content/selectors';
import { ActionLink } from '../../../design-system/components/ActionLink';
import { PieceProgress } from '../../../design-system/components/PieceProgress';
import { StackedCard } from '../../../design-system/components/StackedCard';
import { WorkshopNotice } from '../../../design-system/components/WorkshopNotice';

/** Lessonの振り返りと次の学習ピースへの導線を表示する。 */
export function CompletionPage() {
  const { course, lesson, exercise } = useLoaderData<typeof completionLoader>();
  const nextLesson =
    lesson.nextLessonId === undefined ? undefined : findLesson(course, lesson.nextLessonId);
  return (
    <StackedCard
      as="article"
      data-testid="learning-completion"
      className="mx-auto max-w-3xl overflow-hidden border-2 border-workshop-complete bg-workshop-raised p-0 text-center"
    >
      <div aria-hidden="true" className="flex h-4 gap-1 bg-workshop-workbench p-1">
        <span className="w-1/3 rounded-workshop-piece bg-workshop-wood" />
        <span className="w-1/3 rounded-workshop-piece bg-workshop-learning" />
        <span className="flex-1 rounded-workshop-piece bg-workshop-complete" />
      </div>
      <div className="p-6 md:p-9">
        <p aria-hidden="true" className="text-5xl">
          ✓
        </p>
        <h1 className="mt-3 text-3xl font-black md:text-5xl">ピースがはまりました</h1>
        <PieceProgress
          className="mx-auto mt-6 max-w-lg text-left"
          completed={1}
          total={1}
          label="レッスンの完成"
        />
        <WorkshopNotice tone="complete" title="今回できたこと" className="mt-7 text-left">
          <p className="text-lg leading-8">{lesson.reflection}</p>
          <p className="mt-2">{exercise.title}の完了をこの端末の進捗へ保存しました。</p>
        </WorkshopNotice>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {nextLesson !== undefined ? (
            <>
              <Link
                to={`/courses/${course.id}`}
                className="inline-flex min-h-11 items-center rounded-workshop-md border-2 border-workshop-primary px-5 py-3 font-bold text-workshop-primary"
              >
                コースマップへ戻る
              </Link>
              <ActionLink to={lessonStartPath(course.id, nextLesson)}>次のピースへ進む</ActionLink>
            </>
          ) : (
            <ActionLink to={`/courses/${course.id}`}>コースマップへ戻る</ActionLink>
          )}
        </div>
      </div>
    </StackedCard>
  );
}
