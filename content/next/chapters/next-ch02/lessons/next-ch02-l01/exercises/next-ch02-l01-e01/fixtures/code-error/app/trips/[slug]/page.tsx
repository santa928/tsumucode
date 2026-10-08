/** 動的なURLの値はPromiseで届く。awaitして表示へ渡す。 */
export default async function TripPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main>
      <h1 id="message">旅の詳細</h1>
      <p id="trip-slug">{slug}</p>
      <p>URLから届いた値: {slug}</p>
      <a href="../trips">旅行一覧へ</a>
    </main>
  );
}

export const broken = ;
