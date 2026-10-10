import { loadCatalog, projectBase } from '../catalog';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<{ availability?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  const query = await searchParams;
  const selected = typeof query.availability === 'string' ? query.availability : 'all';
  const items = await loadCatalog();
  if (!['all', 'open', 'full'].includes(selected)) {
    return (
      <main>
        <h1 id="message">読書会一覧</h1>
        <p role="alert">選択を確認してください。</p>
        <a href={projectBase() + '/events'}>一覧へ戻る</a>
      </main>
    );
  }
  const shown = selected === 'all'
    ? items
    : items.filter((item) => selected === 'open' ? item.seats > 0 : item.seats === 0);
  const base = projectBase();
  return (
    <main>
      <h1 id="message">読書会一覧</h1>
      <form method="get" action={base + '/events'}>
        <label htmlFor="filter">受付状況</label>
        <select id="filter" name="availability" defaultValue={selected}>
          <option value="all">すべて</option>
          <option value="open">受付中</option>
          <option value="full">受付終了</option>
        </select>
        <button type="submit">絞り込む</button>
      </form>
      <ul>
        {shown.map((item) => (
          <li key={item.id}>
            <a href={base + '/events/' + item.id}>{item.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
