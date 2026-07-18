/** 演習状態を保持したまま関連Slideを見直すroute画面。 */
import { useLoaderData, useNavigate } from 'react-router-dom';
import type { reviewLoader } from '../../../app/contentLoaders';
import { StackedCard } from '../../../design-system/components/StackedCard';
import { SlideBlocks } from '../components/SlideBlocks';

/** 見直し中であることと演習へ戻る操作を本文より前に伝える。 */
export function ReviewPage() {
  const { course, lesson, exercise, slide } = useLoaderData<typeof reviewLoader>();
  const navigate = useNavigate();
  return (
    <article>
      <StackedCard
        as="aside"
        aria-label="演習へ戻る"
        className="border-2 border-workshop-learning bg-workshop-raised"
      >
        <p className="font-bold">
          {exercise.title}の途中です。コードと判定履歴は保存されています。
        </p>
        <button
          type="button"
          onClick={() => {
            void navigate(`/courses/${course.id}/lessons/${lesson.id}/exercises/${exercise.id}`);
          }}
          className="mt-4 inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary"
        >
          演習へ戻る
        </button>
      </StackedCard>
      <h1 className="mt-8 text-3xl font-black md:text-5xl">{slide.title}</h1>
      <StackedCard className="mt-6 bg-workshop-surface p-5 md:p-8">
        <SlideBlocks
          blocks={slide.blocks}
          assets={slide.assets}
          baseUrl={import.meta.env.BASE_URL}
        />
      </StackedCard>
    </article>
  );
}
