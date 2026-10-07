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
      <div>
        <section>
          <h2>HTML</h2>
          <p>内容を組み立てる</p>
        </section>
        <section>
          <h2>CSS</h2>
          <p>見た目を整える</p>
        </section>
      </div>
    </section>
  );
}

/** 枠とテーマカードをJSXのネストで組み合わせる。 */
export function App() {
  return (
    <LearningPanel>
      <div>
        <TopicCard title="HTML" summary="内容を組み立てる" />
        <TopicCard title="CSS" summary="見た目を整える" />
      </div>
    </LearningPanel>
  );
}
