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
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fixed-publisher-'));
  roots.push(root);
  await mkdir(path.join(root, '.release-v2'));
  await mkdir(path.join(root, 'dist'));
  // Hidden public bytes must survive Pages packaging, too.
  await writeFile(path.join(root, 'dist/.nojekyll'), '');
  await writeFile(path.join(root, 'dist/index.html'), 'same qualified bytes');
  const bundle = releaseFixture();
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
        id: 501,
        sha: bundle.capturedBaseline.proof.workflowHeadCommit,
        ref: 'main',
        environment: 'github-pages',
      },
    ],
    '/deployments/501/statuses': [
      {
        state: 'success',
        environment_url: 'https://owner.github.io/site/',
        log_url: 'https://github.com/owner/site/actions/runs/500/job/201',
      },
    ],
  };
  const environment = {
    ...process.env,
    GITHUB_REPOSITORY: 'owner/site',
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
    const mock = `const states=${JSON.stringify(states)}; globalThis.fetch=async(url,options)=>{if(options.headers.Authorization)throw Error('Unexpected authentication');const prefix='https://api.github.com/repos/owner/site';if(!url.startsWith(prefix)||!(url.slice(prefix.length) in states))throw Error('Unexpected real network request');return new Response(JSON.stringify(states[url.slice(prefix.length)]),{status:200});};\n`;
    const file = path.join(root, 'fixed-workflow.mjs');
    await writeFile(file, mock + body);
    return exec(process.execPath, [file], { cwd: root, env: environment, timeout: 10000 });
  };
  return { root, bundle, qualification, states, environment, run };
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
  expect(await readFile('.github/workflows/pages.yml', 'utf8')).not.toContain(
    'release-v2-publish.yml',
  );
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
])('stops %s mismatch at the actual fixed publisher boundary', async (kind) => {
  const row = await setup();
  if (kind === 'main') row.states['/git/ref/heads/main'] = { object: { sha: '0'.repeat(40) } };
  if (kind === 'parent')
    row.states['/deployments?environment=github-pages&per_page=1'] = [{ id: 999 }];
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
  if (kind === 'symlink') await symlink('../package.json', path.join(row.root, 'dist/link.json'));
  if (kind === 'excluded-directory') {
    await mkdir(path.join(row.root, 'dist/.git'));
    await writeFile(path.join(row.root, 'dist/.git/data'), 'not deployable');
  }
  await expect(row.run()).rejects.toThrow();
});
