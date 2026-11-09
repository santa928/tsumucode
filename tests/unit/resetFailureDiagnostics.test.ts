import { describe, expect, it } from 'vitest';
import { preserveFailureWithDiagnostics } from '../e2e/helpers/resetFailureDiagnostics';

describe('Reset 失敗時の診断', () => {
  it('判定が成功したとき診断を実行しない', async () => {
    let called = false;
    await preserveFailureWithDiagnostics(
      async () => {},
      async () => {
        called = true;
      },
      () => {},
    );
    expect(called).toBe(false);
  });

  it('診断が失敗しても元の判定エラーを保持する', async () => {
    const original = new Error('original assertion');
    await expect(
      preserveFailureWithDiagnostics(
        async () => {
          throw original;
        },
        async () => {
          throw new Error('diagnostic unavailable');
        },
        () => {},
      ),
    ).rejects.toBe(original);
  });

  it('判定に失敗したとき診断を残してから元のエラーを返す', async () => {
    const original = new Error('original assertion');
    const evidence: string[] = [];
    await expect(
      preserveFailureWithDiagnostics(
        async () => {
          throw original;
        },
        async () => {
          return 'saved';
        },
        (value) => {
          evidence.push(value);
        },
      ),
    ).rejects.toBe(original);
    expect(evidence).toEqual(['saved']);
  });

  it('診断が停止しても元の判定エラーを返す', async () => {
    const original = new Error('original assertion');
    await expect(
      preserveFailureWithDiagnostics(
        async () => {
          throw original;
        },
        async () => {
          await new Promise<void>(() => {});
        },
        () => {},
        10,
      ),
    ).rejects.toBe(original);
  });

  it('期限後に観測が完了しても診断を添付しない', async () => {
    const original = new Error('original assertion');
    const evidence: string[] = [];
    let resolveCapture: ((value: string) => void) | undefined;
    await expect(
      preserveFailureWithDiagnostics(
        async () => {
          throw original;
        },
        async () =>
          await new Promise<string>((resolve) => {
            resolveCapture = resolve;
          }),
        (value) => {
          evidence.push(value);
        },
        10,
      ),
    ).rejects.toBe(original);
    resolveCapture?.('late');
    await Promise.resolve();
    expect(evidence).toEqual([]);
  });

  it('添付処理が失敗しても元の判定エラーを保持する', async () => {
    const original = new Error('original assertion');
    await expect(
      preserveFailureWithDiagnostics(
        async () => {
          throw original;
        },
        async () => 'observed',
        () => {
          throw new Error('attachment unavailable');
        },
      ),
    ).rejects.toBe(original);
  });
});
