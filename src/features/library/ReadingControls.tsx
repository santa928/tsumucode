import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { CourseIndex, Lesson } from '../../core/content/types';
import {
  readReadingState,
  saveReadingPosition,
  setExerciseForLater,
  type ReadingPosition,
} from './readingState';
import { readingLessonPath, readingSlidePath } from './readingTargets';

interface Props {
  readonly course: CourseIndex;
  readonly lesson: Lesson;
  readonly position: ReadingPosition;
}

/** 明示操作だけでURLをコピーし、拒否時も選択できるURLを残す。 */
function ShareLink({ path, label }: { readonly path: string; readonly label: string }) {
  const [status, setStatus] = useState({ url: '', message: '' });
  const url = new URL(`${import.meta.env.BASE_URL}#${path}`, window.location.origin).href;
  return (
    <div className="tc-reading-share">
      <label>
        {label}
        <input
          value={url}
          readOnly
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          void (async () => {
            try {
              await navigator.clipboard.writeText(url);
              setStatus({ url, message: 'URLをコピーしました' });
            } catch {
              setStatus({ url, message: 'URLを選択してコピーしてください' });
            }
          })();
        }}
      >
        {label}をコピー
      </button>
      <span role="status">{status.url === url ? status.message : ''}</span>
    </div>
  );
}

/** 読書位置と明示した印だけを保存し、合否やPC再開位置には触れない。 */
export function ReadingControls({ course, lesson, position }: Props) {
  const [saved, setSaved] = useState(readReadingState);
  const [saveFailed, setSaveFailed] = useState(!saved.available);
  const pilot = position.scope === 'pilot';
  const { courseId, lessonId, slideId, mode, scope } = position;
  useEffect(() => {
    // 復元後の描画に合わせて書き込み、次の位置や離脱では古い予約を取り消す。
    const frame = requestAnimationFrame(() => {
      setSaveFailed(!saveReadingPosition({ courseId, lessonId, slideId, mode, scope }));
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [courseId, lessonId, slideId, mode, scope]);
  const alternative =
    mode === 'slides'
      ? `${readingLessonPath(course.id, lesson.id, pilot)}?slide=${encodeURIComponent(slideId)}`
      : readingSlidePath(course.id, lesson.id, slideId, pilot);
  return (
    <aside className="tc-reading-controls" aria-label="読書の続きとPCへの引き継ぎ">
      <p>読書の続きはこの端末・このサイトに保存します。演習の合否やPCの続きは変わりません。</p>
      {saveFailed ? <p role="status">続き位置を保存できません。本文はそのまま読めます。</p> : null}
      {saved.invalid ? (
        <p role="status">前の読書記録を復元できませんでした。本文は先頭から読めます。</p>
      ) : null}
      <Link to={alternative}>
        {mode === 'slides' ? 'この位置から一続きに読む' : 'この位置を1枚ずつ読む'}
      </Link>
      <ShareLink
        path={
          mode === 'slides'
            ? readingSlidePath(course.id, lesson.id, slideId, pilot)
            : `${readingLessonPath(course.id, lesson.id, pilot)}?slide=${encodeURIComponent(slideId)}`
        }
        label="読書位置のURL"
      />
      <h2>あとでPCで試す</h2>
      <p>
        URLで開く場所を渡せます。コードや進捗は端末間で自動同期されません。Pagesとローカル学習版も保存先が別です。学習データは通常学習のJSON書き出し・読み込みで引き継ぎます。
      </p>
      {lesson.exercises.map((exercise) => {
        const target = { scope, courseId, lessonId, exerciseId: exercise.id };
        const marked = saved.state.later.some(
          (item) =>
            item.scope === scope &&
            item.courseId === courseId &&
            item.lessonId === lessonId &&
            item.exerciseId === exercise.id,
        );
        const path = `/courses/${courseId}/lessons/${lessonId}/exercises/${exercise.id}`;
        return (
          <div className="tc-reading-exercise" key={exercise.id}>
            <h3>{exercise.title}</h3>
            <p>
              コードの編集・実行はマウス等を使えるPC向けです。実行環境の対応範囲は演習画面で確認できます。
            </p>
            <button
              type="button"
              aria-pressed={marked}
              onClick={() => {
                const success = setExerciseForLater(target, !marked);
                setSaveFailed(!success);
                if (success) setSaved(readReadingState());
              }}
            >
              {marked ? 'あとで試す印を外す' : 'あとで試す印をつける'}
            </button>
            <Link to={path}>PC向け演習を開く：{exercise.title}</Link>
            <ShareLink path={path} label={`${exercise.title}の演習URL`} />
          </div>
        );
      })}
    </aside>
  );
}
