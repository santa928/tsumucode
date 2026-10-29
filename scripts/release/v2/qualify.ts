import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { captureBaseline } from './captureBaseline';
import { qualifyRelease } from './admission';
import { readRecipe } from './candidate';
import { loadExecutionBundle, readJson } from './runner';
import { selectResultAttempts } from './attempts';
import { repositoryEnvironment, hashValue } from './identity';
import { verifyStoredReports } from './reports';
import { readVerifiedContentPolicy } from './contentOriginals';
import { verifyCandidateArtifact } from './verify';
const exec = promisify(execFile);
/** Fresh actual main/deployment and native workflow needs are read at the last non-deploying gate. */
export async function qualifyCurrentRelease(
  root: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const { snapshot, executionPlan, candidate, capturedBaseline } = await loadExecutionBundle(root);
  if (
    environment.GITHUB_REPOSITORY !== candidate.repository ||
    environment.GITHUB_RUN_ID !== candidate.runId ||
    environment.GITHUB_SHA !== candidate.recipe.sourceCommit ||
    environment.GITHUB_JOB !== 'aggregate' ||
    environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    environment.GITHUB_REF !== 'refs/heads/main'
  )
    throw new Error('Wrong final release context');
  const recipe = await readRecipe(root, candidate.recipe.sourceCommit, candidate.recipe.basePath);
  if (hashValue(recipe) !== hashValue(candidate.recipe)) throw new Error('Final recipe changed');
  await verifyCandidateArtifact(candidate, path.join(root, 'dist'));
  const contentPolicy = await readVerifiedContentPolicy(
    root,
    path.join(root, '.release-v2/content-receipts.json'),
  );
  const siteUrl =
    'https://' + candidate.repository.split('/')[0]! + '.github.io' + candidate.recipe.basePath;
  const currentBaseline = await captureBaseline({
    root,
    repository: candidate.repository,
    siteUrl,
  });
  const gitEnvironment = await repositoryEnvironment(root);
  const remote = (
    await exec('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
      cwd: root,
      env: gitEnvironment,
      encoding: 'utf8',
      timeout: 15000,
    })
  ).stdout.trim();
  const currentMainCommit = z
    .string()
    .regex(/^[a-f0-9]{40}$/u)
    .parse(remote.split(/\s+/u)[0]);
  const needs = z
    .record(
      z.string(),
      z.object({ result: z.enum(['success', 'failure', 'cancelled', 'skipped']) }),
    )
    .parse(JSON.parse(environment.RELEASE_V2_NEEDS ?? 'null') as unknown);
  const jobs = Object.fromEntries(
    Object.entries(needs).map(([name, value]) => [name, value.result]),
  );
  // This caller can only run after its build dependency succeeds and supplies both same-run artifact IDs.
  jobs['build'] = 'success';
  const receipts = path.join(root, '.release-v2/receipts');
  const files = (await readdir(receipts)).filter((name) => name.endsWith('.json')).sort();
  const results = selectResultAttempts(
    candidate,
    await Promise.all(files.map((name) => readJson(path.join(receipts, name)))),
  );
  await verifyStoredReports(root, results);
  return qualifyRelease({
    inventory: snapshot.inventory,
    publicContent: snapshot.publicContent,
    plan: snapshot.plan,
    executionPlan,
    candidate,
    results,
    capturedBaseline,
    currentBaseline,
    contentReceipts: contentPolicy.receipts,
    contentWithdrawals: contentPolicy.withdrawals,
    context: {
      repository: environment.GITHUB_REPOSITORY,
      runId: environment.GITHUB_RUN_ID,
      sourceCommit: environment.GITHUB_SHA,
      currentMainCommit,
      recipe,
      eventName: environment.GITHUB_EVENT_NAME,
      ref: environment.GITHUB_REF,
      attempt: Number(environment.GITHUB_RUN_ATTEMPT),
      now: new Date().toISOString(),
      jobs,
    },
  });
}
