type Mode = 'fresh' | 'cached' | 'revalidate';
type Entry = { readId: number; label: string };
let sequence = 0;
const counts: Partial<Record<Mode, number>> = {};
const last: Partial<Record<Mode, Entry>> = {};
const history: Partial<Record<Mode, Entry[]>> = {};

/** 取得ごとに値を変える固定データ。controlはtrusted採点器からだけ観測する。 */
export function GET(request: Request): Response {
  const parameters = new URL(request.url).searchParams;
  if (parameters.get('control') === 'inspect')
    return Response.json({ sequence, counts, last, history });
  const mode = parameters.get('mode') as Mode;
  if (!['fresh', 'cached', 'revalidate'].includes(mode)) {
    return Response.json({ error: '対象なし' }, { status: 404 });
  }
  sequence += 1;
  const entry = { readId: sequence, label: sequence % 2 === 1 ? '朝の森' : '午後の森' };
  counts[mode] = (counts[mode] ?? 0) + 1;
  last[mode] = entry;
  const recent = history[mode] ?? [];
  recent.push(entry);
  if (recent.length > 16) recent.shift();
  history[mode] = recent;
  return Response.json(entry);
}
