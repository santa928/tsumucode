import { Link } from 'react-router';
import type { CourseCatalogEntry } from '../../core/content/types';
import { ActionLink } from '../../design-system/components/ActionLink';
import { StackedCard } from '../../design-system/components/StackedCard';
import { WorkshopNotice } from '../../design-system/components/WorkshopNotice';
import { useEditingCapability } from '../../shared/device/editingCapability';
import { summarizeCatalogCourseProgress } from '../progress/catalogCourseProgress';
import { useCourseProgress } from '../progress/useCourseProgress';
import { FIRST_ACTIVITY } from './firstActivity';

/** Hash RouterのURLを変えずに教材棚へ移動し、Keyboardの続き位置も揃える。 */
function focusCourseShelf(): void {
  const heading = document.getElementById('course-shelf-title');
  heading?.scrollIntoView({ block: 'start' });
  heading?.focus({ preventScroll: true });
}

/** 確認済みの保存状態と編集可否から、今回の主要操作を1つ選ぶ。保存や自動遷移はしない。 */
export function HomeFirstStep({ course }: { readonly course: CourseCatalogEntry }) {
  const editable = useEditingCapability();
  const saved = useCourseProgress(course.id);
  const summary =
    saved.status === 'ready' ? summarizeCatalogCourseProgress(course, saved.progress) : undefined;
  const startLabel =
    summary?.status === 'in-progress'
      ? 'HTML/CSSの続きから'
      : summary?.status === 'complete'
        ? '完成したHTML/CSSを見直す'
        : summary?.status === 'revision-mismatch'
          ? '教材の更新を確認して続ける'
          : FIRST_ACTIVITY.outcome;
  const studyPrimary = editable && summary !== undefined;
  const readingPath = `/library/${course.id}`;

  return (
    <StackedCard aria-label="今回の学習" className="mt-6 max-w-4xl bg-workshop-raised">
      <p className="text-sm font-bold text-workshop-complete">{course.title}</p>
      <h2 className="mt-2 text-2xl font-black">
        {summary?.status === 'in-progress'
          ? 'この端末の続きから'
          : summary?.status === 'complete'
            ? 'できたページを見直す'
            : summary?.status === 'revision-mismatch'
              ? '更新された教材へ'
              : summary === undefined
                ? 'いま取り組むこと'
                : '最初の小さな制作'}
      </h2>
      {summary?.status === 'not-started' ? (
        <p className="mt-3 text-workshop-muted">
          <span className="mr-2 inline-block rounded-workshop-sm bg-workshop-learning px-2 py-1 font-bold text-workshop-ink">
            目安{FIRST_ACTIVITY.estimatedMinutes}分
          </span>
          解説を読んで、ページの見出しと背景色を1箇所ずつ変え、プレビューで確かめます。
        </p>
      ) : summary?.status === 'in-progress' ? (
        <p className="mt-3 text-workshop-muted">
          保存された学習位置から再開します。下の教材棚から別のコースも選べます。
        </p>
      ) : summary?.status === 'complete' ? (
        <p className="mt-3 text-workshop-muted">
          作ったページを見直したり、教材棚から次に学ぶことを選べます。
        </p>
      ) : summary?.status === 'revision-mismatch' ? (
        <p className="mt-3 text-workshop-muted">
          コースマップで教材の更新を確認し、この端末の続き位置を合わせます。
        </p>
      ) : null}
      {!editable ? (
        <p className="mt-3 text-workshop-muted">
          いまは解説を読めます。コードを変える演習はPCで試せます。読書目次から同じ端末の読書の続きへ戻れます。
        </p>
      ) : null}
      {saved.status === 'loading' ? (
        <p role="status" className="mt-3">
          この端末の続き位置を確認しています。
        </p>
      ) : null}
      {saved.status === 'error' ? (
        <WorkshopNotice tone="correction" title="続き位置を確認できませんでした" className="mt-3">
          <p>{saved.error} 学習の続きは再確認できます。解説は今すぐ読めます。</p>
          <button
            type="button"
            onClick={saved.retry}
            className="mt-2 min-h-11 rounded-workshop-sm border-2 border-workshop-primary px-3 py-2 font-bold text-workshop-primary"
          >
            続き位置を再確認する
          </button>
        </WorkshopNotice>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ActionLink to={studyPrimary ? summary.actionPath : readingPath}>
          {studyPrimary ? startLabel : '解説を読む'}
        </ActionLink>
        {studyPrimary ? (
          <Link
            to={readingPath}
            className="inline-flex min-h-11 items-center px-2 font-bold text-workshop-primary underline"
          >
            解説だけ読む
          </Link>
        ) : null}
        <button
          type="button"
          onClick={focusCourseShelf}
          className="inline-flex min-h-11 items-center px-2 font-bold text-workshop-primary underline"
        >
          ほかの教材を選ぶ
        </button>
      </div>
      <p className="mt-3 text-sm text-workshop-muted">
        <Link to="/library/pilot" className="inline-flex min-h-11 items-center font-bold underline">
          制作途中のレッスンを試す
        </Link>
        <span className="ml-2">HTML導入・JavaScript導入・Closure・DOM</span>
      </p>
    </StackedCard>
  );
}
