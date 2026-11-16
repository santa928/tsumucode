import { describe, expect, it, vi } from 'vitest';
import { withManifestDiagnostic } from '../e2e/helpers/manifestDiagnostic';

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
});
