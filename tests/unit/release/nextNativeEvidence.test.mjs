// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  collectNextNativeEvidence,
  NEXT_NATIVE_GROUPS,
} from '../../../scripts/release/nextNativeEvidence.mjs';
import {
  verifyNextNativeCi,
  REQUIRED_NEXT_NATIVE_STEPS,
} from '../../../scripts/release/verifyNextNativeCi.mjs';

/** Fixture数・resource境界・CI停止条件を検査する専用合成値。実行成功記録には使わない。 */
function fixtures() {
  return NEXT_NATIVE_GROUPS.flatMap(([, count]) =>
    Array.from({ length: count }, (_, index) => ({
      fixture: index === 0 ? 'starter' : `fixture-${index}`,
      measured: {
        zombies: 0,
        memoryPeak: 100,
        memoryCurrent: 100,
        memoryEvents: { max: 0, oom: 0, oomKill: 0 },
        pids: 5,
        workspaceBytes: 10,
        temporaryBytes: 10,
      },
    })),
  );
}
const sourceCommit = 'a'.repeat(40);
const collect = (rows) =>
  collectNextNativeEvidence(
    rows.map((row) => JSON.stringify(row)).join('\n'),
    sourceCommit,
    '123',
    1,
  );

describe('Next実測証拠の欠落・資源超過', () => {
  it('9教材81Fixtureを有限値で集約する', () =>
    expect(collect(fixtures()).workspaces).toHaveLength(9));
  it.each(['欠落', 'NaN', 'OOM', 'Zombie', 'RAM超過'])('%sを成功証拠から除外する', (kind) => {
    const rows = fixtures();
    if (kind === '欠落') rows.pop();
    if (kind === 'NaN') rows[0].measured.memoryPeak = NaN;
    if (kind === 'OOM') rows[0].measured.memoryEvents.oomKill = 1;
    if (kind === 'Zombie') rows[0].measured.zombies = 1;
    if (kind === 'RAM超過') rows[0].measured.memoryPeak = 513 * 1024 ** 2;
    expect(() => collect(rows)).toThrow();
  });
});

describe('Next公開とexact main Local CIの接続', () => {
  function request(changedRun = {}, changedSteps = {}) {
    return async (url, options) => {
      expect(options.headers.Authorization).toBeUndefined();
      const body = url.includes('/artifacts?')
        ? {
            artifacts: [
              {
                id: 789,
                name: `next-native-evidence-${sourceCommit}`,
                expired: false,
                digest: 'sha256:' + 'c'.repeat(64),
                workflow_run: { head_sha: sourceCommit },
              },
            ],
          }
        : url.includes('/jobs?')
          ? {
              jobs: [
                {
                  name: 'boundary',
                  id: 456,
                  status: 'completed',
                  conclusion: 'success',
                  steps: REQUIRED_NEXT_NATIVE_STEPS.map((name) => ({
                    name,
                    status: 'completed',
                    conclusion: changedSteps[name] ?? 'success',
                  })),
                },
              ],
            }
          : {
              workflow_runs: [
                {
                  id: 123,
                  run_attempt: 1,
                  head_sha: sourceCommit,
                  head_branch: 'main',
                  event: 'push',
                  status: 'completed',
                  conclusion: 'success',
                  path: '.github/workflows/local-runtime.yml',
                  ...changedRun,
                },
              ],
            };
      return { ok: true, json: async () => body };
    };
  }
  it('公開APIの対象SHAと全必須step成功だけを受理する', async () => {
    expect(await verifyNextNativeCi(sourceCommit, request())).toMatchObject({
      sourceCommit,
      workflowRunId: '123',
    });
  });
  it.each([
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'other' },
    { conclusion: 'failure' },
    { path: '.github/workflows/other.yml' },
  ])('異なるSHA/branch/workflowまたは失敗を拒否する: %j', async (changedRun) => {
    await expect(verifyNextNativeCi(sourceCommit, request(changedRun))).rejects.toThrow();
  });
  it('省略された応答完了検査を成功runでも拒否する', async () => {
    await expect(
      verifyNextNativeCi(sourceCommit, request({}, { [REQUIRED_NEXT_NATIVE_STEPS[4]]: 'skipped' })),
    ).rejects.toThrow();
  });
});
