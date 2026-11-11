// @vitest-environment node
import { expect, it } from 'vitest';
import {
  recoverKnownPredeployParent,
  verifyKnownPredeployFailure,
} from '../../../../scripts/release/v2/predeployFailure';
import { evidence, prefix, repository } from './predeployFailureFixture';

it('accepts only the independently identified pre-deploy failure and both exact workflow originals', async () => {
  const row = await evidence();
  await expect(
    verifyKnownPredeployFailure(repository, row.deployment, row.read),
  ).resolves.toBeUndefined();
});

it('recovers only the exact immediately preceding successful parent candidate', async () => {
  const row = await evidence();
  const parent = await recoverKnownPredeployParent(repository, row.deployment, row.read);
  expect(parent.id).toBe(7593230441);
});

it.each(['missing', 'extra', 'reordered', 'other-parent', 'other-sha', 'foreign'])(
  'rejects %s parent history',
  async (kind) => {
    const row = await evidence();
    const key = `${prefix}/deployments?environment=github-pages&per_page=2`;
    const values = row.responses[key] as {
      id: number;
      sha: string;
      ref: string;
      environment: string;
    }[];
    if (kind === 'missing') values.pop();
    if (kind === 'extra') values.push({ ...values[1]! });
    if (kind === 'reordered') values.reverse();
    if (kind === 'other-parent') values[1]!.id++;
    if (kind === 'other-sha') values[1]!.sha = '0'.repeat(40);
    if (kind === 'foreign') values[0]!.id++;
    await expect(
      recoverKnownPredeployParent(repository, row.deployment, row.read),
    ).rejects.toThrow();
  },
);

it.each([
  'repository',
  'deployment-id',
  'deployment-source',
  'deployment-ref',
  'status-added',
  'status-id',
  'status-success',
  'status-log',
  'status-site',
  'run-id',
  'run-attempt',
  'run-workflow',
  'run-source',
  'run-event',
  'run-result',
  'job-id',
  'job-run',
  'job-attempt',
  'job-source',
  'job-result',
  'step-order',
  'step-extra',
  'deploy-executed',
  'package-executed',
  'pages-bytes',
  'publish-bytes',
  'workflow-encoding',
  'missing-api',
])('rejects %s evidence', async (kind) => {
  const row = await evidence();
  let repo = repository;
  if (kind === 'repository') repo = 'other/site';
  if (kind === 'deployment-id') row.deployment.id++;
  if (kind === 'deployment-source') row.deployment.sha = '0'.repeat(40);
  if (kind === 'deployment-ref') row.deployment.ref = 'other';
  if (kind === 'status-added') row.statuses.push({ ...row.statuses[0]! });
  if (kind === 'status-id') row.statuses[0]!.id!++;
  if (kind === 'status-success') row.statuses[0]!.state = 'success';
  if (kind === 'status-log') row.statuses[0]!.log_url += '/other';
  if (kind === 'status-site') row.statuses[0]!.environment_url = 'https://other.invalid/';
  if (kind === 'run-id') row.run.id++;
  if (kind === 'run-attempt') row.run.run_attempt++;
  if (kind === 'run-workflow') row.run.workflow_id++;
  if (kind === 'run-source') row.run.head_sha = '0'.repeat(40);
  if (kind === 'run-event') row.run.event = 'push';
  if (kind === 'run-result') row.run.conclusion = 'success';
  if (kind === 'job-id') row.job.id++;
  if (kind === 'job-run') row.job.run_id++;
  if (kind === 'job-attempt') row.job.run_attempt++;
  if (kind === 'job-source') row.job.head_sha = '0'.repeat(40);
  if (kind === 'job-result') row.job.conclusion = 'success';
  if (kind === 'step-order') row.job.steps[0]!.number = 2;
  if (kind === 'step-extra') row.job.steps.push({ ...row.job.steps[0]! });
  if (kind === 'deploy-executed') row.job.steps[6]!.conclusion = 'success';
  if (kind === 'package-executed') row.job.steps[5]!.conclusion = 'success';
  if (kind === 'pages-bytes') row.pages.content = Buffer.from('changed').toString('base64');
  if (kind === 'publish-bytes') row.publish.content = Buffer.from('changed').toString('base64');
  if (kind === 'workflow-encoding') row.pages.encoding = 'utf8';
  if (kind === 'missing-api')
    Reflect.deleteProperty(row.responses, `${prefix}/actions/runs/42758114561`);
  await expect(verifyKnownPredeployFailure(repo, row.deployment, row.read)).rejects.toThrow();
});
