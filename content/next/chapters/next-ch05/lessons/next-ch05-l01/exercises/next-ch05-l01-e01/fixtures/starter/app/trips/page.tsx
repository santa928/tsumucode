import { loadCatalog, projectBase } from '../catalog';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<{ area?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  const query = await searchParams;
  const selected = typeof query.area === 'string' ? query.area : 'all';
  const items = await loadCatalog();
  const shown = items;
  const base = projectBase();
  return (
    <main>
      <h1 id="message">旅の一覧</h1>
      <form method="get" action={base + '/trips'}>
        <label htmlFor="filter">過ごす場所</label>
        <select id="filter" name="area" defaultValue={selected}>
          <option value="all">すべて</option>
          <option value="outdoor">屋外</option>
          <option value="indoor">室内</option>
        </select>
        <button type="submit">絞り込む</button>
      </form>
      <ul>
        {shown.map((item) => (
          <li key={item.id}>
            <a href={base + '/trips/' + item.id}>{item.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
