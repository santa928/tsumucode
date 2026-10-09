import { headers } from 'next/headers';
import type { NoteState } from './note-state';

/** 同じ隔離内の練習用保存先。反映・停止再開で初期化される。 */
export async function storeNote(input: string): Promise<NoteState> {
  const requestHeaders = await headers();
  const lease = requestHeaders.get('x-tsumucode-note-lease');
  const reply = await fetch(
    `http://127.0.0.1:5174${process.env.TSUMUCODE_NEXT_BASE_PATH ?? ''}/api/note-store`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(lease ? { 'x-tsumucode-note-lease': lease } : {}),
      },
      body: JSON.stringify({ input }),
      cache: 'no-store',
    },
  );
  return (await reply.json()) as NoteState;
}
