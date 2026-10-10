import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API_ROOT = 'https://api.github.com/repos/santa928/tsumucode';
export const REQUIRED_NEXT_NATIVE_STEPS = [
  'Verify Next Action response completion, resources and recovery',
  'Verify Next production Project stages and resources',
  'Verify Next real page, query HTTP, resources and recovery',
  'Verify Next nested routing and Client interaction fixtures',
  'Verify trusted Action body completion rejects partial and canceled responses',
  'Verify Next routing and boundary normal Lessons and JSON transfer',
  'Verify Next data and Weather normal Lessons and JSON transfer',
  'Verify Next Form and Action normal Lessons and JSON transfer',
  'Verify Next production Project normal Lessons and ZIP JSON transfer',
  'Verify Next Form POST boundaries and grading contention',
  'Verify Weather RSC cancellation on Source apply and stop',
  'Verify normal controller restart',
  'Verify abnormal controller restart',
  'Collect exact Next native resource evidence',
  'Upload exact Next native resource evidence',
  'Stop only this learning stack and preserve Source volume',
];

/** 公開APIの既存CI結果だけを読み、秘密値やActions権限を追加せず対象SHAの成功を要求する。 */
export async function verifyNextNativeCi(sourceCommit, request = globalThis.fetch) {
  assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
  const read = async (relative) => {
    const response = await request(API_ROOT + relative, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'tsumucode-next-release' },
      signal: globalThis.AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Next CIの公開API照合に失敗しました: ${response.status}`);
    return response.json();
  };
  const runs = await read(
    `/actions/workflows/local-runtime.yml/runs?head_sha=${sourceCommit}&event=push&status=completed&per_page=10`,
  );
  const run = runs.workflow_runs.find(
    (item) =>
      item.head_sha === sourceCommit &&
      item.head_branch === 'main' &&
      item.event === 'push' &&
      item.status === 'completed' &&
      item.conclusion === 'success' &&
      item.path === '.github/workflows/local-runtime.yml',
  );
  if (!run) throw new Error('Next公開にはexact source SHAのmain Local Runtime CI成功が必要です');
  const { jobs } = await read(
    `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  const job = jobs.find(
    (item) =>
      item.name === 'boundary' && item.status === 'completed' && item.conclusion === 'success',
  );
  if (
    !job ||
    REQUIRED_NEXT_NATIVE_STEPS.some(
      (name) =>
        job.steps.filter(
          (step) =>
            step.name === name && step.status === 'completed' && step.conclusion === 'success',
        ).length !== 1,
    )
  )
    throw new Error('Next公開の9教材・応答完了・JSON/ZIP・資源証拠に未実行/失敗があります');
  const artifacts = await read(`/actions/runs/${run.id}/artifacts?per_page=100`);
  const evidence = artifacts.artifacts.filter(
    (item) =>
      item.name === `next-native-evidence-${sourceCommit}` &&
      item.expired === false &&
      /^sha256:[a-f0-9]{64}$/u.test(item.digest) &&
      item.workflow_run?.head_sha === sourceCommit,
  );
  if (evidence.length !== 1)
    throw new Error('Next CIの対象SHAに固定した資源証拠Artifactが欠落/重複しています');
  return {
    sourceCommit,
    workflowRunId: String(run.id),
    workflowRunAttempt: run.run_attempt,
    jobId: String(job.id),
    evidenceArtifactId: String(evidence[0].id),
    evidenceArtifactDigest: evidence[0].digest,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--source-sha');
  if (index === -1) throw new Error('--source-shaが必要です');
  const result = await verifyNextNativeCi(process.argv[index + 1]);
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex !== -1)
    await writeFile(process.argv[outputIndex + 1], JSON.stringify(result, null, 2) + '\n', {
      flag: 'wx',
    });
  console.log(JSON.stringify(result));
}
