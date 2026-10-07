import type { CardProps, PanelProps } from './types';

/** 受け取ったテーマの見出しと説明を表示する。 */
function Summary({ title, summary }: CardProps) {
  return (
    <section>
      <h2>{title}</h2>
      <p>{summary}</p>
    </section>
  );
}

/** 呼び出し元が組み立てたJSXを枠の中に表示する。 */
function Frame(props: PanelProps) {
  return (
    <section>
      <h1>学習テーマ</h1>
      {props.children}
    </section>
  );
}

/** 枠とテーマカードをJSXのネストで組み合わせる。 */
function Overview() {
  return (
    <Frame>
      <div>
        <Summary title="HTML" summary="内容を組み立てる" />
        <Summary title="CSS" summary="見た目を整える" />
      </div>
    </Frame>
  );
}

export { Overview as App };
