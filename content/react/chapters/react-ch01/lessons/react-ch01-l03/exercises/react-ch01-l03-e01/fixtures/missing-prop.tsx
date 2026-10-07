import type { CardProps, PanelProps } from './types';

/** 受け取ったテーマの見出しと説明を表示する。 */
function TopicCard({ title, summary }: CardProps) {
  return (
    <section>
      <h2>{title}</h2>
      <p>{summary}</p>
    </section>
  );
}

/** 呼び出し元が組み立てたJSXを枠の中に表示する。 */
function LearningPanel({ children }: PanelProps) {
  return (
    <section>
      <h1>学習テーマ</h1>
      {children}
    </section>
  );
}

/** 枠とテーマカードをJSXのネストで組み合わせる。 */
export function App() {
  return <LearningPanel />;
}
