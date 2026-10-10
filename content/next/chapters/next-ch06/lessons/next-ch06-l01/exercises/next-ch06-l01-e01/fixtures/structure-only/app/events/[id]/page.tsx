import { notFound } from 'next/navigation';
import { loadCatalog, projectBase } from '../../catalog';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  const items = await loadCatalog();
  const item = items.find((entry) => entry.id === id);
  if (!item) notFound();
  return (
    <main>
      <h1 id="message">{item.title}</h1>
      <p>{item.description}</p>
      <p id="booking-state">{item.seats > 0 ? '受付中' : '受付終了'}</p>
      <a href={projectBase() + '/events'}>一覧へ戻る</a>
    </main>
  );
}
