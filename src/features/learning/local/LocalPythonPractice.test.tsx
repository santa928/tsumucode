import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { LocalPythonPractice } from './LocalPythonPractice';
import {
  LocalPythonPracticeClient,
  type PythonPracticeSnapshot,
} from '../../../adapters/runtime/local/LocalPythonPracticeClient';

const props = {
  exerciseId: 'python-basics-ch01-l02-e01',
  contentRevision: 'python-r1',
  exerciseSessionId: 'session',
  executionRevision: 1,
  files: { 'main.py': 'print(input())\n' },
  disabled: false,
  onBusyChange: vi.fn(),
  prepare: async () => {},
};
const waiting: PythonPracticeSnapshot = {
  purpose: 'practice',
  identity: {
    runId: 'd67b5131-e5df-4f8c-bad0-c6bfbfbda372',
    sessionId: 'session',
    executionRevision: 1,
    sourceHash: 'a'.repeat(64),
  },
  phase: 'waiting-input',
  reason: null,
  inputRequestSequence: 1,
  inputCount: 0,
  inputBytes: 0,
  activeMs: 1,
  waitingMs: 1,
  elapsedMs: 2,
  stdout: '',
  stderr: '',
  removed: false,
  recoveryNeeded: false,
  purged: false,
  exitCode: null,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each(['cancel', 'unmount', 'disabled'])(
  '遅いPreview準備の後に失効した練習を開始しない: %s',
  async (mode) => {
    const preparation = deferred();
    const start = vi.spyOn(LocalPythonPracticeClient.prototype, 'start').mockResolvedValue();
    vi.spyOn(LocalPythonPracticeClient.prototype, 'stop').mockResolvedValue(undefined);
    const user = userEvent.setup();
    const view = render(<LocalPythonPractice {...props} prepare={() => preparation.promise} />);
    await user.click(screen.getByRole('button', { name: '練習実行' }));
    if (mode === 'cancel') await user.click(screen.getByRole('button', { name: '練習を中止' }));
    if (mode === 'unmount') view.unmount();
    if (mode === 'disabled')
      view.rerender(
        <LocalPythonPractice {...props} disabled prepare={() => preparation.promise} />,
      );
    await act(async () => {
      preparation.resolve();
      await preparation.promise;
    });
    expect(start).not.toHaveBeenCalled();
  },
);

it.each(['ended', 'next-request'])(
  '遅い送信応答がpollで届いた新しい状態を上書きしない: %s',
  async (mode) => {
    const done = deferred();
    const sent = deferred();
    let notify!: (snapshot: PythonPracticeSnapshot) => void;
    vi.spyOn(LocalPythonPracticeClient.prototype, 'start').mockImplementation(
      async (_request, callback) => {
        notify = callback;
        callback(waiting);
        await done.promise;
      },
    );
    const send = vi
      .spyOn(LocalPythonPracticeClient.prototype, 'send')
      .mockImplementation(() => sent.promise);
    vi.spyOn(LocalPythonPracticeClient.prototype, 'stop').mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LocalPythonPractice {...props} />);
    await user.click(screen.getByRole('button', { name: '練習実行' }));
    await user.type(screen.getByLabelText('練習へ送る1行（空欄は空文字列）'), '1行');
    await user.click(screen.getByRole('button', { name: '1行を送信' }));
    await act(async () => {
      notify(
        mode === 'ended'
          ? {
              ...waiting,
              phase: 'ended',
              reason: 'completed',
              removed: true,
              inputRequestSequence: null,
            }
          : { ...waiting, inputRequestSequence: 2 },
      );
      if (mode === 'ended') {
        done.resolve();
        await done.promise;
      }
    });
    await act(async () => {
      sent.resolve();
      await sent.promise;
    });
    if (mode === 'ended') {
      expect(screen.getByText('正常終了しました。未採点です。')).toBeVisible();
      expect(screen.queryByLabelText('練習へ送る1行（空欄は空文字列）')).not.toBeInTheDocument();
    } else {
      await waitFor(() => {
        expect(screen.getByLabelText('練習へ送る1行（空欄は空文字列）')).toBeEnabled();
      });
      await user.click(screen.getByRole('button', { name: '1行を送信' }));
      expect(send).toHaveBeenLastCalledWith(2, '', false);
      done.resolve();
    }
  },
);
