// @vitest-environment node
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { hashBytes } from '../../../../scripts/release/v2/identity';

const mocks = vi.hoisted(() => ({ produce: vi.fn(), failWrites: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof FsPromises>();
  return {
    ...original,
    open: async (...args: Parameters<typeof original.open>) => {
      const file = await original.open(...args);
      if (mocks.failWrites && args[1] !== 0) {
        const write = file.writeFile.bind(file);
        vi.spyOn(file, 'writeFile').mockImplementationOnce(async () => {
          await write(Buffer.from('partial'));
          throw Error('simulated write failure');
        });
      }
      return file;
    },
  };
});
vi.mock('../../../../scripts/release/v2/pythonFirstAnchorProducer', () => ({
  producePythonFirstAnchor: mocks.produce,
}));
import { executePythonFirstAnchorEntry } from '../../../../scripts/release/v2/pythonFirstAnchorEntry';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  mocks.produce.mockReset();
  mocks.failWrites = false;
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'anchor-entry-'));
  roots.push(root);
  const candidate = path.join(root, 'candidate');
  const verifier = path.join(root, 'verifier');
  mkdirSync(candidate);
  mkdirSync(verifier);
  const context = path.join(root, 'context.json');
  const output = path.join(root, 'evidence.json');
  writeFileSync(context, JSON.stringify({ repository: 'claim-only' }));
  const evidenceBytes = Buffer.from('{"mode":"anchor"}');
  mocks.produce.mockResolvedValue({ evidenceBytes, evidenceSha256: hashBytes(evidenceBytes) });
  return { root, candidate, verifier, context, output, evidenceBytes };
}

it('writes only the producer evidence as a new private file', async () => {
  const f = fixture();
  const digest = await executePythonFirstAnchorEntry([
    f.candidate,
    f.verifier,
    f.context,
    f.output,
  ]);
  expect(readFileSync(f.output)).toEqual(f.evidenceBytes);
  expect(statSync(f.output).mode & 0o777).toBe(0o600);
  expect(digest).toBe(hashBytes(f.evidenceBytes));
  expect(mocks.produce).toHaveBeenCalledWith(f.candidate, f.verifier, { repository: 'claim-only' });
});

it('rejects malformed, overlarge and symlinked context before observation', async () => {
  const f = fixture();
  writeFileSync(f.context, '{');
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.output]),
  ).rejects.toThrow();
  writeFileSync(f.context, Buffer.alloc(16385));
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.output]),
  ).rejects.toThrow();
  const link = path.join(f.root, 'context-link');
  symlinkSync(f.context, link);
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, link, f.output]),
  ).rejects.toThrow();
  expect(mocks.produce).not.toHaveBeenCalled();
});

it('does not replace an existing output or write inside a checkout', async () => {
  const f = fixture();
  writeFileSync(f.output, 'preserve');
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.output]),
  ).rejects.toThrow();
  expect(readFileSync(f.output, 'utf8')).toBe('preserve');
  expect(readdirSync(f.root).filter((name) => name.startsWith('.anchor-evidence-'))).toEqual([]);
  const outputLink = path.join(f.root, 'output-link');
  symlinkSync(f.output, outputLink);
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, outputLink]),
  ).rejects.toThrow();
  expect(readFileSync(f.output, 'utf8')).toBe('preserve');
  await expect(
    executePythonFirstAnchorEntry([
      f.candidate,
      f.verifier,
      f.context,
      path.join(f.candidate, 'out'),
    ]),
  ).rejects.toThrow();
  const insideContext = path.join(f.candidate, 'context.json');
  writeFileSync(insideContext, '{}');
  await expect(
    executePythonFirstAnchorEntry([
      f.candidate,
      f.verifier,
      insideContext,
      path.join(f.root, 'new-output'),
    ]),
  ).rejects.toThrow();
});

it('rejects inconsistent evidence and preserves producer failures', async () => {
  const f = fixture();
  mocks.produce.mockResolvedValueOnce({
    evidenceBytes: f.evidenceBytes,
    evidenceSha256: '0'.repeat(64),
  });
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.output]),
  ).rejects.toThrow();
  mocks.produce.mockRejectedValueOnce(Error('observation failed'));
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.output]),
  ).rejects.toThrow('observation failed');
  expect(existsSync(f.output)).toBe(false);
});

it('does not leave published or temporary output after a partial write failure', async () => {
  const f = fixture();
  mocks.failWrites = true;
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.output]),
  ).rejects.toThrow('simulated write failure');
  expect(existsSync(f.output)).toBe(false);
  expect(readdirSync(f.root).filter((name) => name.startsWith('.anchor-evidence-'))).toEqual([]);
});
