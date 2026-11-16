import { describe, expect, it, vi } from 'vitest';
import {
  readManifestDiagnosticUi,
  withManifestDiagnostic,
} from '../e2e/helpers/manifestDiagnostic';

describe('manifest learning failure diagnostics', () => {
  it('publishes only fixed diagnostic state when the test fails and preserves the original error', async () => {
    const failure = new Error('private-marker');
    const publish = vi.fn();
    await expect(
      withManifestDiagnostic(async () => {
        throw failure;
      }, publish),
    ).rejects.toBe(failure);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish.mock.calls[0]?.[0]).not.toContain('private-marker');
  });

  it('preserves the original failure if diagnostics publication fails', async () => {
    const failure = new Error('original');
    await expect(
      withManifestDiagnostic(
        async () => {
          throw failure;
        },
        () => {
          throw new Error('diagnostics failed');
        },
      ),
    ).rejects.toBe(failure);
  });

  it('does not publish diagnostics for a successful test', async () => {
    const publish = vi.fn();
    await expect(withManifestDiagnostic(async () => 7, publish)).resolves.toBe(7);
    expect(publish).not.toHaveBeenCalled();
  });

  it('limits phase and result values to the fixed diagnostic vocabulary', async () => {
    const publish = vi.fn<(value: string) => void>();
    const failure = new Error('private-marker');
    await expect(
      withManifestDiagnostic(async (diagnostic) => {
        diagnostic.step('history', 2);
        diagnostic.history(1, 2, 'private-marker');
        throw failure;
      }, publish),
    ).rejects.toBe(failure);
    expect(JSON.parse(publish.mock.calls[0]![0])).toEqual({
      phase: 'history',
      round: 2,
      beforeCapped: 1,
      afterCapped: 2,
      grew: true,
      status: 'other',
    });
    expect(publish.mock.calls[0]![0]).not.toContain('private-marker');
  });

  it('records growth past the count limit and clears stale history on reopening', async () => {
    const failure = new Error('original');
    const publish = vi.fn<(value: string) => void>();
    await expect(
      withManifestDiagnostic(async (diagnostic) => {
        diagnostic.history(20, 21, 'pass');
        throw failure;
      }, publish),
    ).rejects.toBe(failure);
    expect(JSON.parse(publish.mock.calls[0]![0])).toMatchObject({
      beforeCapped: 20,
      afterCapped: 20,
      grew: true,
    });
    await expect(
      withManifestDiagnostic(async (diagnostic) => {
        diagnostic.history(1, 2, 'pass');
        diagnostic.step('opening', 1);
        throw failure;
      }, publish),
    ).rejects.toBe(failure);
    expect(JSON.parse(publish.mock.calls[1]![0])).toMatchObject({
      phase: 'opening',
      beforeCapped: null,
      afterCapped: null,
      grew: null,
      status: null,
    });
  });

  it('classifies only fixed button states and the presence of the operation error', () => {
    document.body.innerHTML = `<div class="tc-exercise-pager">
      <button class="tc-exercise-pager-secondary" disabled>更新しています</button>
      <button class="tc-exercise-pager-primary" disabled>判定する</button>
      <p class="tc-exercise-operation-error">private-marker</p></div>`;
    expect(readManifestDiagnosticUi()).toEqual({
      grade: 'ready-label',
      gradeDisabled: true,
      preview: 'updating',
      operationError: true,
    });
    expect(JSON.stringify(readManifestDiagnosticUi())).not.toContain('private-marker');
    document.querySelector('.tc-exercise-pager-primary')!.textContent = 'private-marker';
    expect(readManifestDiagnosticUi().grade).toBe('other');
    document.querySelector('.tc-exercise-pager-secondary')!.textContent = 'private-marker';
    expect(readManifestDiagnosticUi().preview).toBe('unrecognized-or-missing');
    document.querySelector('.tc-exercise-operation-error')!.remove();
    expect(readManifestDiagnosticUi().operationError).toBe(false);
    document.body.innerHTML = '';
    expect(readManifestDiagnosticUi()).toEqual({
      grade: 'missing',
      gradeDisabled: null,
      preview: 'unrecognized-or-missing',
      operationError: null,
    });
  });

  it('records a normalized snapshot only on failure without leaking arbitrary fields', async () => {
    const failure = new Error('original-private-marker');
    const publish = vi.fn<(value: string) => void>();
    const probe = vi.fn(async () => ({
      grade: 'private-marker',
      gradeDisabled: true,
      preview: 'updating',
      operationError: false,
      extra: 'private-marker',
    }));
    await expect(
      withManifestDiagnostic(
        async () => {
          throw failure;
        },
        publish,
        probe,
      ),
    ).rejects.toBe(failure);
    expect((JSON.parse(publish.mock.calls[0]![0]) as { ui: unknown }).ui).toEqual({
      grade: 'other',
      gradeDisabled: true,
      preview: 'updating',
      operationError: false,
    });
    expect(publish.mock.calls[0]![0]).not.toContain('private-marker');
    publish.mockClear();
    probe.mockClear();
    await expect(withManifestDiagnostic(async () => 7, publish, probe)).resolves.toBe(7);
    expect(probe).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('preserves the original failure when the optional snapshot is unavailable or hangs', async () => {
    vi.useFakeTimers();
    try {
      const failure = new Error('original');
      const publish = vi.fn<(value: string) => void>();
      const result = withManifestDiagnostic(
        async () => {
          throw failure;
        },
        publish,
        () => new Promise(() => {}),
      );
      const assertion = expect(result).rejects.toBe(failure);
      await vi.advanceTimersByTimeAsync(251);
      await assertion;
      expect((JSON.parse(publish.mock.calls[0]![0]) as { ui: unknown }).ui).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the original failure and excludes probe errors when probing rejects', async () => {
    const failure = new Error('original');
    const publish = vi.fn<(value: string) => void>();
    await expect(
      withManifestDiagnostic(
        async () => {
          throw failure;
        },
        publish,
        async () => {
          throw new Error('private-marker');
        },
      ),
    ).rejects.toBe(failure);
    expect((JSON.parse(publish.mock.calls[0]![0]) as { ui: unknown }).ui).toBeNull();
    expect(publish.mock.calls[0]![0]).not.toContain('private-marker');
  });
});
