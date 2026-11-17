// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { repositoryEnvironment } from '../../../../scripts/release/v2/identity';

export const repository = 'santa928/tsumucode';
const source = '9d00cd6dfd12f096c87d486175acdcd6d9795c67';
export const prefix = 'https://api.github.com/repos/' + repository;
const logUrl = 'https://github.com/' + repository + '/actions/runs/42758114561/job/129670621435';

async function original(file: string) {
  const env = await repositoryEnvironment(process.cwd());
  return execFileSync('git', ['show', `${source}:${file}`], { env }).toString('base64');
}

export async function evidence() {
  const deployment = { id: 7675216444, sha: source, ref: 'main', environment: 'github-pages' };
  const names = [
    'Set up job',
    'Download exact same-run public bytes',
    'Download exact same-run build metadata',
    'Download pinned same-run aggregate qualification',
    'Recheck fixed bytes and actual parent after Environment',
    'Package the same verified files for Pages',
    'Deploy the same verified files',
    'Complete job',
  ];
  const results = [
    'success',
    'success',
    'success',
    'success',
    'failure',
    'skipped',
    'skipped',
    'success',
  ];
  const statuses = ['failure', 'in_progress', 'queued', 'queued', 'waiting'].map(
    (state, index) => ({
      id: [21828353186, 21828345728, 21828344399, 21828344164, 21828342972][index],
      state,
      log_url: logUrl,
      environment_url: '',
    }),
  );
  const run = {
    id: 42758114561,
    run_attempt: 1,
    workflow_id: 315500203,
    path: '.github/workflows/pages.yml',
    head_sha: source,
    event: 'workflow_dispatch',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'failure',
  };
  const job = {
    id: 129670621435,
    run_id: 42758114561,
    run_attempt: 1,
    head_sha: source,
    name: 'publish / deploy',
    status: 'completed',
    conclusion: 'failure',
    steps: names.map((name, index) => ({
      name,
      number: index + 1,
      status: 'completed',
      conclusion: results[index],
    })),
  };
  const pages = { encoding: 'base64', content: await original('.github/workflows/pages.yml') };
  const publish = {
    encoding: 'base64',
    content: await original('.github/workflows/release-v2-publish.yml'),
  };
  const responses: Record<string, unknown> = {
    [`${prefix}/deployments/7675216444/statuses?per_page=100`]: statuses,
    [`${prefix}/actions/runs/42758114561`]: run,
    [`${prefix}/actions/runs/42758114561/attempts/1`]: run,
    [`${prefix}/actions/jobs/129670621435`]: job,
    [`${prefix}/contents/.github/workflows/pages.yml?ref=${source}`]: pages,
    [`${prefix}/contents/.github/workflows/release-v2-publish.yml?ref=${source}`]: publish,
    [`${prefix}/deployments?environment=github-pages&per_page=2`]: [
      deployment,
      {
        id: 7593230441,
        sha: 'eb2fe6f8e06409569f173efb2fe6275c46a535cf',
        ref: 'main',
        environment: 'github-pages',
      },
    ],
  };
  const read = async (url: string) => {
    if (!(url in responses)) throw Error('Unexpected or missing evidence');
    return responses[url];
  };
  return { deployment, statuses, run, job, pages, publish, responses, read };
}
