import type { CardProps } from './types';

/** 受け取ったテーマの見出しと説明を表示する。 */
function TopicCard({ title, summary }: CardProps) {
  return (
    <section>
      <h2>{title}</h2>
      <p>{summary}</p>
    </section>
  );
}

/** 同じ表示Componentへ、テーマごとに異なるPropsを渡す。 */
export function App() {
  return (
    <div>
      <h1>学習テーマ</h1>
      <TopicCard title="HTML" />
      <TopicCard title="CSS" summary="見た目を整える" />
    </div>
  );
}
