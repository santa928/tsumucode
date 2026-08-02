import { Link, useParams } from 'react-router';
import { useEditingCapability } from '../../shared/device/editingCapability';

/** 演習画面の実装前も404にせず、提供状況・端末条件・Courseへの復帰手段を示す。 */
export function LearningStepPendingPage() {
  const { courseId = '' } = useParams();
  const canEdit = useEditingCapability();

  return (
    <section aria-labelledby="learning-step-pending-title" className="max-w-2xl py-6">
      <div aria-hidden="true" className="flex h-16 w-44 items-end gap-2">
        <span className="h-8 flex-1 rounded-workshop-piece bg-workshop-learning" />
        <span className="h-14 flex-1 rounded-workshop-piece bg-workshop-complete" />
        <span className="h-11 flex-1 rounded-workshop-piece bg-workshop-wood" />
      </div>
      <p className="mt-6 font-bold text-workshop-complete">次の工程を準備しています</p>
      <h1 id="learning-step-pending-title" className="mt-2 text-3xl font-black md:text-4xl">
        コード演習は準備中です
      </h1>
      <p className="mt-4 text-workshop-muted">
        スライド学習は利用できます。コードを書く演習画面は次の実装工程で接続します。
      </p>
      {!canEdit ? (
        <p className="mt-3 leading-7 text-workshop-muted">
          コード演習の提供後は、幅1024px以上で、マウスまたはトラックパッドを使える環境から開いてください。
        </p>
      ) : null}
      <Link
        to={`/courses/${courseId}`}
        className="mt-7 inline-flex min-h-11 items-center rounded-workshop-sm px-3 py-2 font-bold underline decoration-2 underline-offset-4"
      >
        コースマップへ戻る
      </Link>
    </section>
  );
}
