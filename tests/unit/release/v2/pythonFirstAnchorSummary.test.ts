// @vitest-environment node
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('../../../../scripts/release/v2/boundedFile', () => ({
  readBoundedRegularFile: async () => Buffer.from('modified summary'),
}));
vi.mock('../../../../scripts/release/v2/captureBaseline', () => ({
  captureBaseline: mocks.capture,
}));
import { verifyPythonFirstAnchor } from '../../../../scripts/release/v2/pythonFirstAnchorVerifier';
it('rejects changed verifier summary before querying the deployment', async () => {
  await expect(verifyPythonFirstAnchor('/tmp')).rejects.toThrow(
    'Historical anchor summary differs',
  );
  expect(mocks.capture).not.toHaveBeenCalled();
});
