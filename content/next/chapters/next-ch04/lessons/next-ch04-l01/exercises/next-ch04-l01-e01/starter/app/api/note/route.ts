import { storeNote } from '../../note-store';

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
