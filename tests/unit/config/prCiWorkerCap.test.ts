// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePrCiWorkerLimit } from '../../../scripts/prCiWorkerCap';

describe('PR CI worker cap', () => {
  it.each([
    [1, '1'],
    [2, '1'],
    [3, '2'],
    [4, '2'],
  ] as const)('%i CPU never increases default workers', (cpu, expected) => {
    expect(resolvePrCiWorkerLimit(undefined, () => cpu)).toBe(expected);
  });

  it('preserves lower explicit limits and falls back when CPU is unknown', () => {
    expect(resolvePrCiWorkerLimit('1', () => 4)).toBe('1');
    expect(resolvePrCiWorkerLimit('9', () => 4)).toBe('2');
    expect(resolvePrCiWorkerLimit(undefined, () => 0)).toBeUndefined();
    expect(
      resolvePrCiWorkerLimit('1', () => {
        throw Error('unavailable');
      }),
    ).toBe('1');
    expect(() => resolvePrCiWorkerLimit('0', () => 4)).toThrow();
  });

  it.each(['fast', 'prepush'] as const)(
    '%s calls the complete check and propagates failure',
    (mode) => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'pr-ci-cap-'));
      try {
        const log = path.join(dir, 'calls');
        const npm = path.join(dir, 'npm');
        writeFileSync(
          npm,
          '#!/bin/sh\nprintf "%s\\n%s\\n" "$*" "$TSUMUCODE_TEST_MAX_WORKERS" > "$TRACE"\nexit "${FAKE_EXIT:-0}"\n',
        );
        chmodSync(npm, 0o700);
        const base = 'a'.repeat(40);
        const args = mode === 'fast' ? [mode] : [mode, base];
        const env = {
          ...process.env,
          PATH: `${dir}${path.delimiter}${process.env['PATH'] ?? ''}`,
          TRACE: log,
          TSUMUCODE_TEST_MAX_WORKERS: '1',
        };
        const run = (code: string) =>
          spawnSync(process.execPath, ['--import', 'tsx', 'scripts/runPrCiCheck.ts', ...args], {
            env: { ...env, FAKE_EXIT: code },
            encoding: 'utf8',
          });
        expect(run('0').status).toBe(0);
        expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
          mode === 'fast' ? 'run check:ci' : `run check:prepush -- ${base}`,
          '1',
        ]);
        expect(run('43').status).toBe(43);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('rejects unexpected commands and base values before starting npm', () => {
    for (const args of [['fast', 'x'], ['prepush', 'not-a-sha'], ['other']]) {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/runPrCiCheck.ts', ...args],
        { encoding: 'utf8' },
      );
      expect(result.status).not.toBe(0);
    }
  });
});
