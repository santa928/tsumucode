import type { CardProps as ThemeProps } from './types';

/** 見出しと説明の表示を別のComponentへ分けてもよい。 */
function Details(props: ThemeProps) {
  return (
    <section>
      <h2>{props.title}</h2>
      <p>{props.summary}</p>
    </section>
  );
}

function Summary(props: ThemeProps) {
  return <Details title={props.title} summary={props.summary} />;
}

function Overview() {
  return (
    <div>
      <h1>学習テーマ</h1>
      <Summary title="HTML" summary="内容を組み立てる" />
      <Summary title="CSS" summary="見た目を整える" />
    </div>
  );
}

export { Overview as App };
