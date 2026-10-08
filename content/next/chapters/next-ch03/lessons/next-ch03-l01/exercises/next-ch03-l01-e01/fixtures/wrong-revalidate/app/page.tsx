/** 保持条件の異なる3つのServer pageへ移動する。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">取得と保持を比べる</h1>
      <a href="./data/fresh">毎回取得</a>
      <a href="./data/cached">保持した値</a>
      <a href="./data/revalidate">期限後の更新</a>
    </main>
  );
}
