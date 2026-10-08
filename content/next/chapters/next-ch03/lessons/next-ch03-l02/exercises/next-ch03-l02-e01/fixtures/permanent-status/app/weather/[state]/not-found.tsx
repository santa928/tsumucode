/** 対象なしを、取得失敗の再試行案内と分ける。 */
export default function Missing() {
  return (
    <main>
      <h1 id="message">対象が見つかりません</h1>
      <p>この記録はありません。</p>
    </main>
  );
}
