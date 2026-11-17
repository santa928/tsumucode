// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'yaml';
import { releaseFixture } from './releaseFixture';
import { hashArtifact, hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { evidence as failureEvidence, prefix as failurePrefix } from './predeployFailureFixture';
const exec = promisify(execFile),
  roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function workflow() {
  return parse(await readFile('.github/workflows/release-v2-publish.yml', 'utf8')) as {
    on: Record<string, unknown>;
    jobs: {
      deploy: {
        environment: { name: string };
        permissions: Record<string, string>;
        steps: {
          id?: string;
          name: string;
          uses?: string;
          run?: string;
          with?: Record<string, unknown>;
        }[];
      };
    };
  };
}
async function setup(recovery = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fixed-publisher-'));
  roots.push(root);
  await mkdir(path.join(root, '.release-v2'));
  await mkdir(path.join(root, 'dist'));
  // Hidden public bytes must survive Pages packaging, too.
  await writeFile(path.join(root, 'dist/.nojekyll'), '');
  await writeFile(path.join(root, 'dist/index.html'), 'same qualified bytes');
  const bundle = releaseFixture();
  const repository = recovery ? 'santa928/tsumucode' : 'owner/site';
  const site = recovery ? 'https://santa928.github.io/tsumucode/' : 'https://owner.github.io/site/';
  if (recovery) {
    bundle.candidate.repository = repository;
    bundle.candidate.recipe.basePath = '/tsumucode/';
    bundle.capturedBaseline.proof.repository = repository;
    bundle.capturedBaseline.proof.deploymentId = '7593230441';
    bundle.capturedBaseline.proof.workflowHeadCommit = 'eb2fe6f8e06409569f173efb2fe6275c46a535cf';
    bundle.capturedBaseline.proof.runId = '42154759825';
    bundle.capturedBaseline.baseline.deploymentId = '7593230441';
    bundle.capturedBaseline.baseline.sourceRecordDigest = hashValue(bundle.capturedBaseline.proof);
    bundle.snapshot.plan.parent = {
      deploymentId: '7593230441',
      sourceRecordDigest: bundle.capturedBaseline.baseline.sourceRecordDigest,
    };
    bundle.candidate.planDigest = hashValue({
      plan: bundle.snapshot.plan,
      executionPlan: bundle.executionPlan,
    });
  }
  bundle.candidate.artifactDigest = (await hashArtifact(path.join(root, 'dist'))).digest;
  const qualification = {
    schemaVersion: 1,
    status: 'qualified',
    candidateDigest: hashValue(bundle.candidate),
    qualifiedAt: new Date(Date.now() - 60000).toISOString(),
    parent: bundle.snapshot.plan.parent,
    technical: {
      status: 'technical-passed',
      candidateDigest: hashValue(bundle.candidate),
      buildAttempt: 1,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  };
  for (const [name, value] of Object.entries({
    candidate: bundle.candidate,
    preparation: bundle.snapshot,
    'execution-plan': bundle.executionPlan,
    baseline: bundle.capturedBaseline,
  }))
    await writeFile(path.join(root, '.release-v2/' + name + '.json'), JSON.stringify(value));
  const qualified = Buffer.from(JSON.stringify(qualification));
  await writeFile(path.join(root, '.release-v2/qualification.json'), qualified);
  const states: Record<string, unknown> = {
    '/git/ref/heads/main': { object: { sha: bundle.candidate.recipe.sourceCommit } },
    '/deployments?environment=github-pages&per_page=1': [
      {
        id: recovery ? 7593230441 : 501,
        sha: bundle.capturedBaseline.proof.workflowHeadCommit,
        ref: 'main',
        environment: 'github-pages',
      },
    ],
    ['/deployments/' + (recovery ? '7593230441' : '501') + '/statuses']: [
      {
        state: 'success',
        environment_url: site,
        log_url:
          'https://github.com/' +
          repository +
          '/actions/runs/' +
          (recovery ? '42154759825' : '500') +
          '/job/201',
      },
    ],
  };
  const environment = {
    ...process.env,
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: bundle.candidate.recipe.sourceCommit,
    GITHUB_RUN_ID: '101',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    CANDIDATE_ARTIFACT_ID: '301',
    METADATA_ARTIFACT_ID: '302',
    QUALIFICATION_ARTIFACT_ID: '303',
    QUALIFICATION_SHA256: hashBytes(qualified),
  };
  const setDeployments = (values: unknown[]) => {
    states['/deployments?environment=github-pages&per_page=1'] = values.slice(0, 1);
    states['/deployments?environment=github-pages&per_page=2'] = values.slice(0, 2);
    states['/deployments?environment=github-pages&per_page=3'] = values.slice(0, 3);
  };
  setDeployments(states['/deployments?environment=github-pages&per_page=1'] as unknown[]);
  // No package manager or candidate script may execute inside the privileged publisher.
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { prepublish: 'touch SOURCE-EXECUTED' } }),
  );
  const run = async () => {
    const source = (await workflow()).jobs.deploy.steps.find(
      (step) => step.id === 'acceptance',
    )!.run!;
    const body = source.slice(source.indexOf("<<'JS'\n") + 7, source.lastIndexOf('\nJS'));
    expect(body).not.toMatch(/from ['"](?!node:)|child_process|\bexec\(|\bspawn\(/u);
    const mock = `const states=${JSON.stringify(states)}; globalThis.fetch=async(url,options)=>{if(options.headers.Authorization)throw Error('Unexpected authentication');const prefix='https://api.github.com/repos/'+${JSON.stringify(environment.GITHUB_REPOSITORY)};if(!url.startsWith(prefix)||!(url.slice(prefix.length) in states))throw Error('Unexpected real network request');const value=states[url.slice(prefix.length)];const response=Array.isArray(value)&&Array.isArray(value[0])?value.shift():value&&Array.isArray(value.__sequence)?value.__sequence.shift():value;return new Response(JSON.stringify(response),{status:200});};\n`;
    const file = path.join(root, 'fixed-workflow.mjs');
    await writeFile(file, mock + body);
    return exec(process.execPath, [file], { cwd: root, env: environment, timeout: 10000 });
  };
  return { root, bundle, qualification, states, environment, run, setDeployments };
}
it('rechecks real downloaded bytes and actual parent after Environment without checkout or Source execution', async () => {
  const row = await setup();
  expect((await row.run()).stdout).toContain('No Source code executed');
  await expect(readFile(path.join(row.root, 'SOURCE-EXECUTED'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  const job = (await workflow()).jobs.deploy;
  expect(job.environment.name).toBe('github-pages');
  expect(job.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' });
  expect(Object.keys((await workflow()).on)).toEqual(['workflow_call']);
  expect(job.steps.some((step) => /checkout|setup-node/.test(step.uses ?? ''))).toBe(false);
  const packaging = job.steps.findIndex(
    (step) => step.name === 'Package the same verified files for Pages',
  );
  expect(packaging).toBeGreaterThan(job.steps.findIndex((step) => step.id === 'acceptance'));
  expect(job.steps[packaging]!.with).toMatchObject({ 'include-hidden-files': true, path: 'dist' });
  expect(job.steps[packaging + 1]!.with!.artifact_name).toBe(job.steps[packaging]!.with!.name);
  expect(await readFile('.github/workflows/pages.yml', 'utf8')).toContain('release-v2-publish.yml');
});
it.each([
  'main',
  'parent',
  'parent-status',
  'expired',
  'artifact',
  'pin',
  'candidate-id',
  'run',
  'ref',
  'symlink',
  'excluded-directory',
  'missing-preparation',
  'malformed-preparation',
  'oversized-preparation',
  'altered-plan',
])('stops %s mismatch at the actual fixed publisher boundary', async (kind) => {
  const row = await setup();
  if (kind === 'main') row.states['/git/ref/heads/main'] = { object: { sha: '0'.repeat(40) } };
  if (kind === 'parent') row.setDeployments([{ id: 999 }]);
  if (kind === 'parent-status') row.states['/deployments/501/statuses'] = [{ state: 'pending' }];
  if (kind === 'expired') {
    row.qualification.technical.expiresAt = new Date(Date.now() - 1000).toISOString();
    const bytes = Buffer.from(JSON.stringify(row.qualification));
    await writeFile(path.join(row.root, '.release-v2/qualification.json'), bytes);
    row.environment.QUALIFICATION_SHA256 = hashBytes(bytes);
  }
  if (kind === 'artifact') await writeFile(path.join(row.root, 'dist/index.html'), 'changed');
  if (kind === 'pin') row.environment.QUALIFICATION_SHA256 = '0'.repeat(64);
  if (kind === 'candidate-id') row.environment.CANDIDATE_ARTIFACT_ID = '999';
  if (kind === 'run') row.environment.GITHUB_RUN_ID = '999';
  if (kind === 'ref') row.environment.GITHUB_REF = 'refs/heads/feature';
  const preparation = path.join(row.root, '.release-v2/preparation.json');
  if (kind === 'missing-preparation') await rm(preparation);
  if (kind === 'malformed-preparation') await writeFile(preparation, '{');
  if (kind === 'oversized-preparation')
    await writeFile(preparation, ' '.repeat(4 * 1024 * 1024 + 1));
  if (kind === 'altered-plan')
    await writeFile(preparation, JSON.stringify({ ...row.bundle.snapshot, plan: {} }));
  if (kind === 'symlink') await symlink('../package.json', path.join(row.root, 'dist/link.json'));
  if (kind === 'excluded-directory') {
    await mkdir(path.join(row.root, 'dist/.git'));
    await writeFile(path.join(row.root, 'dist/.git/data'), 'not deployable');
  }
  await expect(row.run()).rejects.toThrow();
});

async function ownEnvironment() {
  const row = await setup();
  const parent = (row.states['/deployments?environment=github-pages&per_page=2'] as unknown[])[0];
  const self = {
    id: 601,
    sha: row.environment.GITHUB_SHA,
    ref: 'main',
    environment: 'github-pages',
  };
  const status = {
    state: 'in_progress',
    environment_url: '',
    log_url: 'https://github.com/owner/site/actions/runs/101/job/602',
  };
  row.states['/deployments/601/statuses'] = [status];
  row.setDeployments([self, parent]);
  return { ...row, self, status, parent };
}

async function recoveryEnvironment() {
  const row = await setup(true);
  const evidence = await failureEvidence();
  for (const [url, value] of Object.entries(evidence.responses))
    row.states[url.slice(failurePrefix.length)] = value;
  const parent = (
    row.states['/deployments?environment=github-pages&per_page=1'] as unknown[]
  )[0] as { id: number; sha: string; ref: string; environment: string };
  const self = {
    id: 601,
    sha: row.environment.GITHUB_SHA,
    ref: 'main',
    environment: 'github-pages',
  };
  const status = {
    state: 'in_progress',
    environment_url: '',
    log_url: 'https://github.com/santa928/tsumucode/actions/runs/101/job/602',
  };
  row.states['/deployments/601/statuses'] = [status];
  row.setDeployments([self, evidence.deployment, parent]);
  return { ...row, self, status, parent, evidence };
}

it('rechecks the exact pre-deploy failure and the real parent at the protected publisher', async () => {
  const row = await recoveryEnvironment();
  await expect(row.run()).resolves.toBeDefined();
});

it.each([
  'new-deployment',
  'changed-failure-status',
  'changed-parent-status',
  'changed-main',
  'changed-self-status',
])('rejects %s after initial recovery evidence was fetched', async (kind) => {
  const row = await recoveryEnvironment();
  if (kind === 'new-deployment') {
    row.states['/deployments?environment=github-pages&per_page=3'] = [
      [row.self, row.evidence.deployment, row.parent],
      [{ id: 700 }, row.self, row.evidence.deployment],
    ];
  }
  if (kind === 'changed-failure-status') {
    row.states['/deployments/7675216444/statuses?per_page=100'] = [
      row.evidence.statuses,
      [{ ...row.evidence.statuses[0]!, state: 'success' }, ...row.evidence.statuses],
    ];
  }
  if (kind === 'changed-parent-status') {
    row.states['/deployments/7593230441/statuses'] = [
      row.states['/deployments/7593230441/statuses'],
      [{ state: 'failure' }],
    ];
  }
  if (kind === 'changed-main') {
    row.states['/git/ref/heads/main'] = {
      __sequence: [
        { object: { sha: row.environment.GITHUB_SHA } },
        { object: { sha: '0'.repeat(40) } },
      ],
    };
  }
  if (kind === 'changed-self-status') {
    row.states['/deployments/601/statuses'] = [[row.status], [{ ...row.status, state: 'success' }]];
  }
  await expect(row.run()).rejects.toThrow();
});

it.each([
  'other-failure',
  'intervening',
  'missing-parent',
  'parent-sha',
  'parent-failed',
  'status-history',
  'run-retried',
  'workflow-bytes',
  'deploy-executed',
  'foreign-self',
  'missing-evidence',
])('rejects %s during protected recovery', async (kind) => {
  const row = await recoveryEnvironment();
  if (kind === 'other-failure') row.evidence.deployment.id++;
  if (kind === 'intervening')
    row.setDeployments([row.self, { id: 700 }, row.evidence.deployment, row.parent]);
  if (kind === 'missing-parent') row.setDeployments([row.self, row.evidence.deployment]);
  if (kind === 'parent-sha') row.parent.sha = '0'.repeat(40);
  if (kind === 'parent-failed')
    row.states['/deployments/7593230441/statuses'] = [{ state: 'failure' }];
  if (kind === 'status-history') row.evidence.statuses.push({ ...row.evidence.statuses[0]! });
  if (kind === 'run-retried') row.evidence.run.run_attempt++;
  if (kind === 'workflow-bytes')
    row.evidence.pages.content = Buffer.from('changed').toString('base64');
  if (kind === 'deploy-executed') row.evidence.job.steps[6]!.conclusion = 'success';
  if (kind === 'foreign-self')
    row.status.log_url = 'https://github.com/santa928/tsumucode/actions/runs/999/job/602';
  if (kind === 'missing-evidence') delete row.states['/actions/jobs/129670621435'];
  await expect(row.run()).rejects.toThrow();
});

it.each(['job', 'run'])(
  'recognizes this Environment deployment by its exact %s URL before checking the parent',
  async (kind) => {
    const row = await ownEnvironment();
    if (kind === 'run') row.status.log_url = 'https://github.com/owner/site/actions/runs/101';
    await expect(row.run()).resolves.toBeDefined();
  },
);

it.each([
  'sha',
  'ref',
  'environment',
  'foreign-run',
  'failed',
  'already-success',
  'foreign-between',
  'missing-parent',
  'wrong-site',
])('does not ignore an unverified Environment deployment: %s', async (kind) => {
  const row = await ownEnvironment();
  if (kind === 'sha') row.self.sha = '0'.repeat(40);
  if (kind === 'ref') row.self.ref = 'feature';
  if (kind === 'environment') row.self.environment = 'other';
  if (kind === 'foreign-run')
    row.status.log_url = 'https://github.com/owner/site/actions/runs/999/job/602';
  if (kind === 'failed') row.status.state = 'failure';
  if (kind === 'already-success') row.status.state = 'success';
  if (kind === 'wrong-site') row.status.environment_url = 'https://other.invalid/';
  if (kind === 'foreign-between') row.setDeployments([row.self, { id: 700 }, row.parent]);
  else if (kind === 'missing-parent') row.setDeployments([row.self]);
  else row.setDeployments([row.self, row.parent]);
  await expect(row.run()).rejects.toThrow();
});
