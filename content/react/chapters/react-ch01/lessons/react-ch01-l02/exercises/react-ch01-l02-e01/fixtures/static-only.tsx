import type { CardProps } from './types';
function TopicCard({ title, summary }: CardProps) {
  return (
    <section>
      <h2>{title}</h2>
      <p>{summary}</p>
    </section>
  );
}
export function App() {
  return (
    <div>
      <h1>学習テーマ</h1>
      <section>
        <h2>HTML</h2>
        <p>内容を組み立てる</p>
      </section>
      <section>
        <h2>CSS</h2>
        <p>見た目を整える</p>
      </section>
    </div>
  );
}
