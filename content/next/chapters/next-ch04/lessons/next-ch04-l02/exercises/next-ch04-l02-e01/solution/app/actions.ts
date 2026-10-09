'use server';

import { storeNote } from './note-store';
import type { NoteState } from './note-state';

/** HTTP200だけで成功とせず、検証・一時失敗・保存の状態を返す。 */
export async function saveNote(_previous: NoteState, formData: FormData): Promise<NoteState> {
  const raw = formData.get('note');
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (input.length < 3 || input.length > 40) {
    return {
      status: 'invalid',
      message: '前後の空白を除いて3〜40文字で入力してください。',
      count: 0,
      input: typeof raw === 'string' ? raw : '',
    };
  }
  const state = await storeNote(input);
  return { ...state, input: typeof raw === 'string' ? raw : '' };
}
