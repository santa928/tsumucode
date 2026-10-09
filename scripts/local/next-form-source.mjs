// 固定2教材の初期原稿。保存先・実行設定は編集対象にしない。

export const FORM_STARTER_FILES = Object.freeze({
  'app/api/note/route.ts': `import { storeNote } from '../../note-store';

/** Client側の制約とは別に、実POSTの入力をServerで検証する。 */
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  const raw = body !== null && typeof body === 'object' && 'input' in body ? body.input : undefined;
  const input = typeof raw === 'string' ? raw : '';
  if (input.length < 3 || input.length > 40) {
    return Response.json(
      {
        status: 'invalid',
        message: '前後の空白を除いて3〜40文字で入力してください。',
        count: 0,
        input: typeof raw === 'string' ? raw : '',
      },
      { status: 400 },
    );
  }
  const state = await storeNote(input);
  return Response.json(
    { ...state, input: typeof raw === 'string' ? raw : '' },
    { status: state.status === 'saved' ? 200 : 503 },
  );
}
`,
  'app/globals.css': `body {
  font-family: sans-serif;
  margin: 2rem;
}
main {
  max-width: 36rem;
}
label,
input,
button {
  display: block;
  margin-block: 0.75rem;
}
input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.5rem;
}
button {
  padding: 0.5rem 1rem;
}
`,
  'app/layout.tsx': `import type { ReactNode } from 'react';
import './globals.css';

/** 全pageを日本語のHTMLで囲む。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
`,
  'app/note-form.tsx': `'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { initialState } from './note-state';
import type { NoteState } from './note-state';

export default function NoteForm({ endpoint }: { endpoint: string }) {
  const [input, setInput] = useState('');
  const [state, setState] = useState<NoteState>(initialState);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    const submitted = input;
    try {
      const reply = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: submitted }),
      });
      setState((await reply.json()) as NoteState);
    } catch {
      setState({
        status: 'failed',
        message: '送信できませんでした。同じ内容で再試行してください。',
        count: 0,
        input: submitted,
      });
    } finally {
      setPending(false);
    }
  }
  const visible = state;
  return (
    <form onSubmit={submit}>
      <label htmlFor="note">メモ</label>
      <input
        id="note"
        name="note"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        required
        minLength={3}
        maxLength={40}
        disabled={false}
        aria-describedby="note-result"
      />
      <button type="submit" disabled={pending}>
        {pending ? '送信中…' : '保存する'}
      </button>
      <p id="note-result" role="status" aria-live="polite" data-state={visible.status}>
        {pending ? '送信中です。' : visible.message}
      </p>
      {visible.status === 'saved' && <p id="saved-count">このメモの保存回数: {visible.count}</p>}
    </form>
  );
}
`,
  'app/note-state.ts': `export type NoteState = {
  status: 'idle' | 'invalid' | 'failed' | 'saved';
  message: string;
  count: number;
  input: string;
};

export const initialState: NoteState = {
  status: 'idle',
  message: '',
  count: 0,
  input: '',
};
`,
  'app/note-store.ts': `import { headers } from 'next/headers';
import type { NoteState } from './note-state';

/** 同じ隔離内の練習用保存先。反映・停止再開で初期化される。 */
export async function storeNote(input: string): Promise<NoteState> {
  const requestHeaders = await headers();
  const lease = requestHeaders.get('x-tsumucode-note-lease');
  const reply = await fetch(
    \`http://127.0.0.1:5174\${process.env.TSUMUCODE_NEXT_BASE_PATH ?? ''}/api/note-store\`,
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
`,
  'app/page.tsx': `import NoteForm from './note-form';

/** 入力の検証と、同じ内容の再試行を実サーバーで試す。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">メモを保存する</h1>
      <p>
        空白だけは検証エラー。通常のメモは最初に一度失敗し、同じ内容で再試行すると保存できます。
      </p>
      <p>練習用の保存先です。Source反映・停止再開で履歴は初期化されます。</p>
      <NoteForm endpoint={\`\${process.env.TSUMUCODE_NEXT_BASE_PATH ?? ''}/api/note\`} />
    </main>
  );
}
`,
});

export const ACTION_STARTER_FILES = Object.freeze({
  'app/actions.ts': `'use server';

import { storeNote } from './note-store';
import type { NoteState } from './note-state';

/** HTTP200だけで成功とせず、検証・一時失敗・保存の状態を返す。 */
export async function saveNote(_previous: NoteState, formData: FormData): Promise<NoteState> {
  const raw = formData.get('note');
  const input = typeof raw === 'string' ? raw : '';
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
`,
  'app/globals.css': `body {
  font-family: sans-serif;
  margin: 2rem;
}
main {
  max-width: 36rem;
}
label,
input,
button {
  display: block;
  margin-block: 0.75rem;
}
input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.5rem;
}
button {
  padding: 0.5rem 1rem;
}
`,
  'app/layout.tsx': `import type { ReactNode } from 'react';
import './globals.css';

/** 全pageを日本語のHTMLで囲む。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
`,
  'app/note-form.tsx': `'use client';

import { useActionState, useState } from 'react';
import { saveNote } from './actions';
import { initialState } from './note-state';

export default function NoteForm() {
  const [input, setInput] = useState('');
  const [state, formAction, pending] = useActionState(saveNote, initialState);
  const visible = state;
  return (
    <form action={formAction}>
      <label htmlFor="note">メモ</label>
      <input
        id="note"
        name="note"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        required
        minLength={3}
        maxLength={40}
        disabled={false}
        aria-describedby="note-result"
      />
      <button type="submit" disabled={pending}>
        {pending ? '送信中…' : '保存する'}
      </button>
      <p id="note-result" role="status" aria-live="polite" data-state={visible.status}>
        {pending ? '送信中です。' : visible.message}
      </p>
      {visible.status === 'saved' && <p id="saved-count">このメモの保存回数: {visible.count}</p>}
    </form>
  );
}
`,
  'app/note-state.ts': `export type NoteState = {
  status: 'idle' | 'invalid' | 'failed' | 'saved';
  message: string;
  count: number;
  input: string;
};

export const initialState: NoteState = {
  status: 'idle',
  message: '',
  count: 0,
  input: '',
};
`,
  'app/note-store.ts': `import { headers } from 'next/headers';
import type { NoteState } from './note-state';

/** 同じ隔離内の練習用保存先。反映・停止再開で初期化される。 */
export async function storeNote(input: string): Promise<NoteState> {
  const requestHeaders = await headers();
  const lease = requestHeaders.get('x-tsumucode-note-lease');
  const reply = await fetch(
    \`http://127.0.0.1:5174\${process.env.TSUMUCODE_NEXT_BASE_PATH ?? ''}/api/note-store\`,
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
`,
  'app/page.tsx': `import NoteForm from './note-form';

/** 入力の検証と、同じ内容の再試行を実サーバーで試す。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">メモを保存する</h1>
      <p>
        空白だけは検証エラー。通常のメモは最初に一度失敗し、同じ内容で再試行すると保存できます。
      </p>
      <p>練習用の保存先です。Source反映・停止再開で履歴は初期化されます。</p>
      <NoteForm />
    </main>
  );
}
`,
});
