import { expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, useState } from '../../../src/adapters/runtime/react/trustedRuntimeEntry';

it('更新時のReact描画例外を専用Bridge通知へ渡し、実行結果の成功に混ぜない', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const errors: unknown[] = [];
  vi.stubGlobal('__tsumucodeReportReactError', (error: unknown) => errors.push(error));
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  function App() {
    const [failed, setFailed] = useState(false);
    if (failed) throw new Error('更新描画の失敗');
    return (
      <button
        onClick={() => {
          setFailed(true);
        }}
      >
        更新
      </button>
    );
  }
  try {
    await act(async () => {
      await Promise.resolve();
      createRoot(container).render(React.createElement(App));
    });
    await act(async () => {
      await Promise.resolve();
      container.querySelector('button')!.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('表示中にエラー');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe('更新描画の失敗');
  } finally {
    vi.unstubAllGlobals();
    container.remove();
    consoleError.mockRestore();
  }
});
