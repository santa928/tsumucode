/** 一覧のURLから2つの詳細URLへ文書を読み直して移動する。 */
export default function TripsPage() {
  return (
    <main>
      <h1 id="message">旅行一覧</h1>
      <a href="./trips/forest">森の旅へ</a>
      <a href="./trips/forest">海の旅へ</a>
    </main>
  );
}
