import { notFound } from 'next/navigation';
import { loadCatalog, projectBase } from '../../catalog';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  const items = await loadCatalog();
  const item = items.filter((entry) => entry.id === id)[0];
  if (!item) notFound();
  return (
    <main>
      <h1 id="message">{item.title}</h1>
      <p>{item.description}</p>
      <p id="area">{item.area === 'outdoor' ? '屋外' : '室内'}</p>
      <a href={projectBase() + '/trips'}>一覧へ戻る</a>
    </main>
  );
}
