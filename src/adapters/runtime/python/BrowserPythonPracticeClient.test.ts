import { expect, it, vi } from 'vitest';
import { BrowserPythonPracticeClient } from './BrowserPythonPracticeClient';

const request = {
  exerciseId: 'python-basics-ch01-l02-e01',
  contentRevision: 'r1',
  exerciseSessionId: 'session',
  executionRevision: 1,
  files: { 'main.py': 'print(input())' },
};

it('対応しないブラウザではcore取得もframe生成もせず未対応を示す', async () => {
  const loader = vi.fn();
  const client = new BrowserPythonPracticeClient(loader, () => false);
  await expect(client.start(request, vi.fn())).rejects.toThrow('対話練習に未対応');
  expect(loader).not.toHaveBeenCalled();
  expect(document.querySelector('iframe')).toBeNull();
});

it.each(['python-basics-ch01-l08-e01', 'unknown'])(
  '固定された同期入力教材以外を練習実行へ渡さない: %s',
  async (exerciseId) => {
    const loader = vi.fn();
    const client = new BrowserPythonPracticeClient(loader, () => true);
    await expect(client.start({ ...request, exerciseId }, vi.fn())).rejects.toThrow('教材');
    expect(loader).not.toHaveBeenCalled();
  },
);

it('待機前・終了後の入力を拒否する', async () => {
  const client = new BrowserPythonPracticeClient(vi.fn(), () => true);
  await expect(client.send(1, '')).rejects.toThrow('入力待機');
  await client.stop();
  await expect(client.send(1, undefined, true)).rejects.toThrow('入力待機');
});
