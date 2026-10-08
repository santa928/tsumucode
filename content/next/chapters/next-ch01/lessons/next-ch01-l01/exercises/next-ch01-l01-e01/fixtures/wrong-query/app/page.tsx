/** pageの見出しを返す。APIのJSONとは別の応答。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">こんにちは、Next.js！</h1>
      <p>見出しと、queryが異なる2つのHTTP応答を確かめます。</p>
    </main>
  );
}
