/** 同じ隔離内の制御データだけを指す。秘密情報や外部APIは使わない。 */
export function dataUrl(kind: 'sample' | 'weather', mode: string): string {
  const base = process.env.TSUMUCODE_NEXT_BASE_PATH ?? '';
  const query = kind === 'sample' ? 'mode' : 'state';
  return `http://127.0.0.1:5174${base}/api/${kind}?${query}=${mode}`;
}
