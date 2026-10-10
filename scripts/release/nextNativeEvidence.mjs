import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const NEXT_NATIVE_GROUPS = [
  ['next-ch04-l02-e01', 9, 512],
  ['next-ch05-l01-e01', 11, 896],
  ['next-ch06-l01-e01', 12, 896],
  ['next-ch01-l01-e01', 6, 512],
  ['next-ch02-l01-e01', 8, 576],
  ['next-ch02-l02-e01', 9, 512],
  ['next-ch03-l01-e01', 8, 576],
  ['next-ch03-l02-e01', 9, 576],
  ['next-ch04-l01-e01', 9, 512],
];

/** 有限の実測値だけを受け入れ、欠落・OOM・Zombie・承認資源超過を拒否する。 */
export function collectNextNativeEvidence(source, sourceCommit, workflowRunId, workflowRunAttempt) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
  assert.match(workflowRunId, /^[1-9]\d*$/u);
  assert.ok(Number.isSafeInteger(workflowRunAttempt) && workflowRunAttempt > 0);
  const rows = source
    .split('\n')
    .filter((line) => line.startsWith('{"fixture":'))
    .map((line) => JSON.parse(line))
    .filter((row) => row.measured);
  assert.equal(rows.length, 81, '9教材81Fixtureの実測が必要です');
  let offset = 0;
  const workspaces = NEXT_NATIVE_GROUPS.map(([workspaceId, count, limitMiB]) => {
    const fixtures = rows.slice(offset, (offset += count));
    assert.equal(fixtures[0].fixture, 'starter');
    assert.equal(new Set(fixtures.map(({ fixture }) => fixture)).size, count);
    const measurements = fixtures.map(({ measured }) => measured);
    for (const sample of measurements) {
      for (const key of [
        'zombies',
        'memoryPeak',
        'memoryCurrent',
        'pids',
        'workspaceBytes',
        'temporaryBytes',
      ])
        assert.ok(
          Number.isSafeInteger(sample[key]) && sample[key] >= 0,
          `${workspaceId}.${key}が有限の実測値ではありません`,
        );
      assert.equal(sample.zombies, 0);
      assert.deepEqual(sample.memoryEvents, { max: 0, oom: 0, oomKill: 0 });
      assert.ok(sample.memoryPeak > 0 && sample.memoryPeak <= limitMiB * 1024 ** 2);
      assert.ok(sample.memoryCurrent <= limitMiB * 1024 ** 2);
      assert.ok(sample.pids > 0 && sample.pids <= 64);
      assert.ok(sample.workspaceBytes <= 64 * 1024 ** 2 && sample.temporaryBytes <= 64 * 1024 ** 2);
    }
    return {
      workspaceId,
      fixtureCount: count,
      limitMiB,
      peakBytes: Math.max(...measurements.map(({ memoryPeak }) => memoryPeak)),
      maximumPids: Math.max(...measurements.map(({ pids }) => pids)),
      memoryEvents: { max: 0, oom: 0, oomKill: 0 },
      zombies: 0,
    };
  });
  return {
    schemaVersion: 1,
    courseId: 'next',
    sourceCommit,
    workflowRunId,
    workflowRunAttempt,
    scope: '9教材81Fixtureのcheckpoint。通常UIの連続監視ではありません。',
    workspaces,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = collectNextNativeEvidence(
    await readFile(process.argv[2], 'utf8'),
    process.env.TSUMUCODE_NEXT_SOURCE_SHA,
    process.env.GITHUB_RUN_ID,
    Number(process.env.GITHUB_RUN_ATTEMPT),
  );
  await writeFile(process.argv[3], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
}
