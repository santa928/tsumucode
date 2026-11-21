// @vitest-environment node
import {
  constants,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
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
      if (
        mocks.failWrites &&
        typeof args[1] === 'number' &&
        (args[1] & (constants.O_WRONLY | constants.O_RDWR)) !== 0
      ) {
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
  const captured = path.join(root, 'captured.json');
  const history = path.join(root, 'history.json');
  const output = path.join(root, 'evidence.json');
  writeFileSync(context, JSON.stringify({ repository: 'claim-only' }));
  writeFileSync(captured, 'synthetic-captured');
  writeFileSync(history, 'synthetic-history');
  const evidenceBytes = Buffer.from('{"mode":"anchor"}');
  mocks.produce.mockResolvedValue({ evidenceBytes, evidenceSha256: hashBytes(evidenceBytes) });
  return { root, candidate, verifier, context, captured, history, output, evidenceBytes };
}

it('writes only the producer evidence as a new private file', async () => {
  const f = fixture();
  const digest = await executePythonFirstAnchorEntry([
    f.candidate,
    f.verifier,
    f.context,
    f.captured,
    f.history,
    f.output,
  ]);
  expect(readFileSync(f.output)).toEqual(f.evidenceBytes);
  expect(statSync(f.output).mode & 0o777).toBe(0o600);
  expect(digest).toBe(hashBytes(f.evidenceBytes));
  expect(mocks.produce).toHaveBeenCalledWith(realpathSync(f.candidate), realpathSync(f.verifier), { repository: 'claim-only' },
    Buffer.from('synthetic-captured'),Buffer.from('synthetic-history'));
});

it('rejects malformed, overlarge and symlinked context before observation', async () => {
  const f = fixture();
  writeFileSync(f.context, '{');
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.captured, f.history, f.output]),
  ).rejects.toThrow();
  writeFileSync(f.context, Buffer.alloc(16385));
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.captured, f.history, f.output]),
  ).rejects.toThrow();
  const link = path.join(f.root, 'context-link');
  symlinkSync(f.context, link);
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, link, f.captured, f.history, f.output]),
  ).rejects.toThrow();
  expect(mocks.produce).not.toHaveBeenCalled();
});

it('rejects missing, empty, oversized and symlinked historical inputs before observation',async()=>{
  const f=fixture();
  for(const target of [f.captured,f.history]){
    const original=readFileSync(target);
    writeFileSync(target,Buffer.alloc(0));
    await expect(executePythonFirstAnchorEntry([f.candidate,f.verifier,f.context,f.captured,f.history,f.output])).rejects.toThrow();
    writeFileSync(target,Buffer.alloc(16*1024*1024+1));
    await expect(executePythonFirstAnchorEntry([f.candidate,f.verifier,f.context,f.captured,f.history,f.output])).rejects.toThrow();
    writeFileSync(target,original);
  }
  const link=path.join(f.root,'history-link');symlinkSync(f.history,link);
  await expect(executePythonFirstAnchorEntry([f.candidate,f.verifier,f.context,f.captured,link,f.output])).rejects.toThrow();
  unlinkSync(f.history);
  await expect(executePythonFirstAnchorEntry([f.candidate,f.verifier,f.context,f.captured,f.history,f.output])).rejects.toThrow();
  expect(mocks.produce).not.toHaveBeenCalled();expect(existsSync(f.output)).toBe(false);
});

it('rejects a FIFO historical input without blocking or producing evidence',async()=>{
  const f=fixture();unlinkSync(f.history);execFileSync('mkfifo',[f.history]);
  const result=await Promise.race([
    executePythonFirstAnchorEntry([f.candidate,f.verifier,f.context,f.captured,f.history,f.output]).then(()=> 'accepted',()=> 'rejected'),
    new Promise<string>((resolve)=>setTimeout(()=>{ resolve('timed-out'); },1000)),
  ]);
  expect(result).toBe('rejected');expect(mocks.produce).not.toHaveBeenCalled();expect(existsSync(f.output)).toBe(false);
});

it('rejects a FIFO context without blocking or writing evidence', () => {
  const f = fixture();
  unlinkSync(f.context);
  execFileSync('mkfifo', [f.context]);
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/release/v2/pythonFirstAnchorEntry.ts',
      f.candidate,
      f.verifier,
      f.context,
      f.captured,
      f.history,
      f.output,
    ],
    { encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH, HOME: f.root } },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('Anchor observation failed');
  expect(existsSync(f.output)).toBe(false);
}, 10000);

it('does not replace an existing output or write inside a checkout', async () => {
  const f = fixture();
  writeFileSync(f.output, 'preserve');
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.captured, f.history, f.output]),
  ).rejects.toThrow();
  expect(readFileSync(f.output, 'utf8')).toBe('preserve');
  expect(readdirSync(f.root).filter((name) => name.startsWith('.anchor-evidence-'))).toEqual([]);
  const outputLink = path.join(f.root, 'output-link');
  symlinkSync(f.output, outputLink);
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.captured, f.history, outputLink]),
  ).rejects.toThrow();
  expect(readFileSync(f.output, 'utf8')).toBe('preserve');
  await expect(
    executePythonFirstAnchorEntry([
      f.candidate,
      f.verifier,
      f.context,
      f.captured,
      f.history,
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
      f.captured,
      f.history,
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
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.captured, f.history, f.output]),
  ).rejects.toThrow();
  mocks.produce.mockRejectedValueOnce(Error('observation failed'));
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.captured, f.history, f.output]),
  ).rejects.toThrow('observation failed');
  expect(existsSync(f.output)).toBe(false);
});

it('does not leave published or temporary output after a partial write failure', async () => {
  const f = fixture();
  mocks.failWrites = true;
  await expect(
    executePythonFirstAnchorEntry([f.candidate, f.verifier, f.context, f.captured, f.history, f.output]),
  ).rejects.toThrow('simulated write failure');
  expect(existsSync(f.output)).toBe(false);
  expect(readdirSync(f.root).filter((name) => name.startsWith('.anchor-evidence-'))).toEqual([]);
});
