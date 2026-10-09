export type NoteState = {
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
