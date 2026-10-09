import type { CatalogItem } from './data';

/** Localの同じrunと、持ち出したrootの経路を対応させる。 */
export function projectBase(): string {
  return process.env.TSUMUCODE_NEXT_BASE_PATH ?? '';
}

/** 同じサーバーの固定Route Handlerを実HTTPで取得し、通信失敗を隠さない。 */
export async function loadCatalog(): Promise<readonly CatalogItem[]> {
  const port = process.env.PORT ?? '5174';
  const reply = await fetch('http://127.0.0.1:' + port + projectBase() + '/api/catalog', {
    cache: 'no-store',
    signal: AbortSignal.timeout(1500),
  });
  if (!reply.ok) throw new Error('一覧データを取得できません。');
  return (await reply.json()) as CatalogItem[];
}
