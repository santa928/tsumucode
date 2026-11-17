import { z } from 'zod';
import { hashBytes } from './identity';

export const PREDEPLOY_FAILURE_ID = 7675216444;
export const PREDEPLOY_PARENT_ID = 7593230441;
export const PREDEPLOY_PARENT_SHA = 'eb2fe6f8e06409569f173efb2fe6275c46a535cf';
const source = '9d00cd6dfd12f096c87d486175acdcd6d9795c67';
const run = 42758114561;
const job = 129670621435;
const repositoryName = 'santa928/tsumucode';
const jobUrl =
  'https://github.com/' + repositoryName + '/actions/runs/' + String(run) + '/job/' + String(job);
const expectedSteps = [
  ['Set up job', 'success'],
  ['Download exact same-run public bytes', 'success'],
  ['Download exact same-run build metadata', 'success'],
  ['Download pinned same-run aggregate qualification', 'success'],
  ['Recheck fixed bytes and actual parent after Environment', 'failure'],
  ['Package the same verified files for Pages', 'skipped'],
  ['Deploy the same verified files', 'skipped'],
  ['Complete job', 'success'],
] as const;
const workflowHashes = [
  ['pages.yml', 'e26a0e10dab9c29325a372569809691feb3084c39c7d1892ef39d15d12b4aa00'],
  ['release-v2-publish.yml', 'b0e7d952930b3ca64dd4677140bd98f96b5b5d71333d9c60b690b52abf207365'],
] as const;

/** 配信処理に到達しなかった既知の1件だけを、GitHub原本から再確認する。 */
export async function verifyKnownPredeployFailure(
  repository: string,
  deployment: unknown,
  read: (url: string) => Promise<unknown>,
): Promise<void> {
  if (repository !== repositoryName) throw new Error('Unexpected pre-deploy repository');
  z.object({
    id: z.literal(PREDEPLOY_FAILURE_ID),
    sha: z.literal(source),
    ref: z.literal('main'),
    environment: z.literal('github-pages'),
  }).parse(deployment);
  const api = 'https://api.github.com/repos/' + repository;
  const statuses = z
    .array(
      z.object({
        id: z.number().int(),
        state: z.string(),
        log_url: z.literal(jobUrl),
        environment_url: z.literal(''),
      }),
    )
    .length(5)
    .parse(
      await read(api + '/deployments/' + String(PREDEPLOY_FAILURE_ID) + '/statuses?per_page=100'),
    );
  const expectedStatuses = [
    [21828353186, 'failure'],
    [21828345728, 'in_progress'],
    [21828344399, 'queued'],
    [21828344164, 'queued'],
    [21828342972, 'waiting'],
  ] as const;
  if (
    statuses.some(
      (status, index) =>
        status.id !== expectedStatuses[index]![0] || status.state !== expectedStatuses[index]![1],
    )
  )
    throw new Error('Pre-deploy status history differs');
  const runSchema = z.object({
    id: z.literal(run),
    run_attempt: z.literal(1),
    workflow_id: z.literal(315500203),
    path: z.literal('.github/workflows/pages.yml'),
    head_sha: z.literal(source),
    event: z.literal('workflow_dispatch'),
    head_branch: z.literal('main'),
    status: z.literal('completed'),
    conclusion: z.literal('failure'),
  });
  runSchema.parse(await read(api + '/actions/runs/' + String(run)));
  runSchema.parse(await read(api + '/actions/runs/' + String(run) + '/attempts/1'));
  const actualJob = z
    .object({
      id: z.literal(job),
      run_id: z.literal(run),
      run_attempt: z.literal(1),
      head_sha: z.literal(source),
      name: z.literal('publish / deploy'),
      status: z.literal('completed'),
      conclusion: z.literal('failure'),
      steps: z
        .array(
          z.object({
            name: z.string(),
            number: z.number().int(),
            status: z.literal('completed'),
            conclusion: z.string(),
          }),
        )
        .length(expectedSteps.length),
    })
    .parse(await read(api + '/actions/jobs/' + String(job)));
  if (
    actualJob.steps.some(
      (step, index) =>
        step.number !== index + 1 ||
        step.name !== expectedSteps[index]![0] ||
        step.conclusion !== expectedSteps[index]![1],
    )
  )
    throw new Error('Pre-deploy job steps differ');
  for (const [file, digest] of workflowHashes) {
    const original = z
      .object({ encoding: z.literal('base64'), content: z.string().max(100000) })
      .parse(await read(api + '/contents/.github/workflows/' + file + '?ref=' + source));
    const encoded = original.content.replace(/\s/gu, '');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded || hashBytes(bytes) !== digest)
      throw new Error('Pre-deploy workflow bytes differ');
  }
}

/** 既知失敗の直前にある固定親以外は、成功していても回復候補にしない。 */
export async function recoverKnownPredeployParent(
  repository: string,
  deployment: unknown,
  read: (url: string) => Promise<unknown>,
) {
  await verifyKnownPredeployFailure(repository, deployment, read);
  const pair = z
    .array(
      z.object({
        id: z.number().int().positive(),
        sha: z.string(),
        ref: z.string(),
        environment: z.string(),
      }),
    )
    .length(2)
    .parse(
      await read(
        'https://api.github.com/repos/' +
          repository +
          '/deployments?environment=github-pages&per_page=2',
      ),
    );
  if (
    pair[0]!.id !== PREDEPLOY_FAILURE_ID ||
    pair[0]!.sha !== source ||
    pair[0]!.ref !== 'main' ||
    pair[0]!.environment !== 'github-pages'
  )
    throw new Error('Pre-deploy failure is no longer latest');
  const parent = pair[1]!;
  if (
    parent.id !== PREDEPLOY_PARENT_ID ||
    parent.sha !== PREDEPLOY_PARENT_SHA ||
    parent.ref !== 'main' ||
    parent.environment !== 'github-pages'
  )
    throw new Error('Pre-deploy parent differs');
  return parent;
}
