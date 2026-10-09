import NoteForm from './note-form';

/** 入力の検証と、同じ内容の再試行を実サーバーで試す。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">メモを保存する</h1>
      <p>
        空白だけは検証エラー。通常のメモは最初に一度失敗し、同じ内容で再試行すると保存できます。
      </p>
      <p>練習用の保存先です。Source反映・停止再開で履歴は初期化されます。</p>
      <NoteForm endpoint={`${process.env.TSUMUCODE_NEXT_BASE_PATH ?? ''}/api/note`} />
    </main>
  );
}
