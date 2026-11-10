// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { writePreparationJson } from '../../../../scripts/release/v2/json';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function target() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preparation-json-'));
  roots.push(root);
  return path.join(root, 'preparation.json');
}

it('keeps every obligation and its digest when readable indentation exceeds the publisher limit', async () => {
  const preparation = {
    inventory: {
      courses: Array.from({ length: 15000 }, (_, index) => ({
        id: `lesson-${String(index)}`,
        text: '学ぶ'.repeat(10),
        obligations: [{ kind: 'exercise', hash: 'a'.repeat(64) }],
      })),
    },
  };
  expect(Buffer.byteLength(JSON.stringify(preparation, null, 2)) + 1).toBeGreaterThan(
    4 * 1024 * 1024,
  );
  const file = await target();
  await writePreparationJson(file, preparation);
  const bytes = await readFile(file);
  expect(bytes.length).toBeLessThanOrEqual(4 * 1024 * 1024);
  const decoded = JSON.parse(bytes.toString('utf8')) as unknown;
  expect(decoded).toEqual(preparation);
  expect(hashValue(decoded)).toBe(hashValue(preparation));
});

it.each([4 * 1024 * 1024 - 1, 4 * 1024 * 1024])(
  'accepts a preparation of exactly %i bytes',
  async (size) => {
    const file = await target();
    // JSON string quotes and the final newline account for three bytes.
    await writePreparationJson(file, 'x'.repeat(size - 3));
    expect((await readFile(file)).length).toBe(size);
  },
);

it('rejects an oversized preparation before writing an output', async () => {
  const file = await target();
  await expect(writePreparationJson(file, 'x'.repeat(4 * 1024 * 1024 - 2))).rejects.toThrow(
    /oversized preparation/i,
  );
  await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each(['valid', 'oversized'])(
  'routes %s CLI preparation through the bounded writer',
  async (kind) => {
    const preparation = await import('../../../../scripts/release/v2/prepare');
    const value = {
      inventory: { text: kind === 'oversized' ? 'x'.repeat(4 * 1024 * 1024) : '学ぶ' },
    };
    vi.spyOn(preparation, 'prepareRelease').mockResolvedValue(value as never);
    const { runCli } = await import('../../../../scripts/release/v2/cli');
    const file = await target();
    const run = () => runCli(['prepare', '--root', process.cwd(), '--output', file]);
    if (kind === 'oversized') {
      await expect(run()).rejects.toThrow(/oversized preparation/i);
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
    } else {
      await run();
      const bytes = await readFile(file, 'utf8');
      expect(JSON.parse(bytes)).toEqual(value);
      expect(bytes).toBe(JSON.stringify(value) + '\n');
    }
  },
);
