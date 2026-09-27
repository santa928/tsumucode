import { Link } from 'react-router';
import type { Lesson } from '../../../core/content/types';

/** 必須完了条件を増やさず、同じLessonの任意練習と予測への再訪先を示す。 */
export function OptionalPracticeLinks({
  courseId,
  lesson,
  currentExerciseId,
}: {
  readonly courseId: string;
  readonly lesson: Lesson;
  readonly currentExerciseId?: string;
}) {
  if (lesson.completion.kind !== 'standard') return null;
  const required = lesson.completion.requiredExerciseIds;
  const optional = lesson.exercises.filter(({ id }) => !required.includes(id));
  if (optional.length === 0) return null;
  const prediction = lesson.slides.find(({ blocks }) =>
    blocks.some(({ type }) => type === 'prediction'),
  );
  const base = `/courses/${courseId}/lessons/${lesson.id}`;
  const linkClass =
    'inline-flex min-h-11 items-center rounded-workshop-md border-2 border-workshop-primary px-4 py-2 font-bold text-workshop-primary';
  return (
    <aside
      className="mt-5 rounded-workshop-md border border-workshop-border bg-workshop-raised p-4 text-left"
      aria-label="追加練習と見直し"
    >
      <h2 className="text-lg font-black">もう少し試す（任意）</h2>
      <p className="mt-2">
        追加練習に取り組まなくても、ガイド練習で得たレッスン完了はそのまま残ります。
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {optional
          .filter(({ id }) => id !== currentExerciseId)
          .map((exercise) => (
            <Link key={exercise.id} className={linkClass} to={`${base}/exercises/${exercise.id}`}>
              追加練習：{exercise.title}
            </Link>
          ))}
        {prediction !== undefined ? (
          <Link className={linkClass} to={`${base}/slides/${prediction.id}`}>
            予測と理由を見直す
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
