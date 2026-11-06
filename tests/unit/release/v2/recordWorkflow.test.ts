// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expect, it, afterEach } from 'vitest';
import { parse } from 'yaml';
import { releaseFixture, syntheticPublishedOperations } from './releaseFixture';
import { hashValue, hashBytes } from '../../../../scripts/release/v2/identity';
import {
  createVerifiedAppRecord,
  planAppRecordRecovery,
} from '../../../../scripts/release/v2/publication';
const exec = promisify(execFile),
  roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function workflow() {
  return parse(await readFile('.github/workflows/release-v2-publish.yml', 'utf8')) as {
    jobs: {
      record: {
        permissions: Record<string, string>;
        needs: string[];
        steps: { uses?: string; id?: string; run?: string; with?: Record<string, string> }[];
      };
      report: {
        permissions: Record<string, string>;
        env: Record<string, string>;
        outputs: Record<string, string>;
        steps: { id?: string; run?: string }[];
      };
    };
  };
}
async function setup(mode = 'create') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'record-writer-'));
  roots.push(root);
  await mkdir(path.join(root, '.release-v2'));
  const bundle = releaseFixture(),
    candidate = bundle.candidate;
  const now = Date.now();
  const qualification = {
    schemaVersion: 1,
    status: 'qualified',
    candidateDigest: hashValue(candidate),
    qualifiedAt: new Date(now - 60000).toISOString(),
    parent: bundle.snapshot.plan.parent,
    technical: {
      status: 'technical-passed',
      candidateDigest: hashValue(candidate),
      buildAttempt: 1,
      verificationAttempts: [1],
      suites: ['synthetic-fixture'],
      expiresAt: new Date(
        now + (mode.startsWith('late-') || mode === 'expired-at-deployment' ? -40000 : 60000),
      ).toISOString(),
    },
    content: {
      status: 'maintenance',
      carriedLessons: ['topic/lesson'],
      newlyApprovedLessons: [],
      technicalRechecks: [],
    },
    projects: [],
  };
  const actual = {
    repository: 'owner/site',
    deploymentId: '501',
    workflowHeadCommit: candidate.recipe.sourceCommit,
    runId: candidate.runId,
    siteUrl: 'https://owner.github.io/site/',
    createdAt: new Date(now - 50000).toISOString(),
  };
  const smoke = {
    schemaVersion: 1,
    status: 'passed',
    candidateDigest: hashValue(candidate),
    artifactDigest: candidate.artifactDigest,
    actual,
    checkedFiles: 1,
    observedAt: new Date(now - 30000).toISOString(),
  };
  const operations = await syntheticPublishedOperations(
    candidate,
    bundle.snapshot.inventory,
    actual,
    new Date(now - 20000).toISOString(),
  );
  const record = createVerifiedAppRecord(
    candidate,
    { inventory: bundle.snapshot.inventory, publicContent: bundle.snapshot.publicContent },
    qualification,
    smoke,
    actual,
    new Date(now - 10000).toISOString(),
    operations,
  );
  const prepared = {
    schemaVersion: 1,
    state: 'record-plan-only',
    record,
    plan: planAppRecordRecovery(record, actual, undefined),
  };
  const qualificationBytes = Buffer.from(JSON.stringify(qualification)),
    smokeBytes = Buffer.from(JSON.stringify(smoke)),
    planBytes = Buffer.from(JSON.stringify(prepared));
  for (const [file, value] of Object.entries({
    candidate: candidate,
    preparation: bundle.snapshot,
  }))
    await writeFile(path.join(root, '.release-v2/' + file + '.json'), JSON.stringify(value));
  await writeFile(path.join(root, '.release-v2/qualification.json'), qualificationBytes);
  await writeFile(path.join(root, '.release-v2/public-smoke.json'), smokeBytes);
  const operationsBytes = Buffer.from(JSON.stringify(operations));
  await writeFile(path.join(root, '.release-v2/public-operations.json'), operationsBytes);
  await writeFile(path.join(root, '.release-v2/app-record-plan.json'), planBytes);
  const environment = {
    ...process.env,
    GITHUB_REPOSITORY: 'owner/site',
    GITHUB_SHA: candidate.recipe.sourceCommit,
    GITHUB_RUN_ID: candidate.runId,
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    CANDIDATE_ARTIFACT_ID: candidate.artifactId,
    QUALIFICATION_SHA256: hashBytes(qualificationBytes),
    PUBLIC_SMOKE_SHA256: hashBytes(smokeBytes),
    PUBLIC_OPERATIONS_SHA256: hashBytes(operationsBytes),
    RECORD_PLAN_SHA256: hashBytes(planBytes),
    GH_TOKEN: 'synthetic-write-token',
    GITHUB_OUTPUT: path.join(root, 'outputs'),
  };
  const run = async () => {
    const step = (await workflow()).jobs.record.steps.find((step) => step.id === 'write_record')!;
    const code = step.run!.slice(step.run!.indexOf("<<'JS'\n") + 7, step.run!.lastIndexOf('\nJS'));
    expect(code).not.toMatch(/from ['"](?!node:)|child_process|\bexec\(|\bspawn\(/u);
    const mock = `import {writeFileSync} from 'node:fs';
      { const calls=[],record=${JSON.stringify(record)},mode=${JSON.stringify(mode)};
      let exists=mode==='reuse'||mode==='reuse-observation'||mode==='late-reuse'||mode==='conflict',reads=0;
      let refAttempted=false,refReads=0;
      globalThis.setTimeout=(callback,delay)=>{
        calls.push({relative:'wait',method:'WAIT',delay});
        callback();
      };
      process.on('exit',()=>writeFileSync('calls.json',JSON.stringify(calls)));
      globalThis.fetch=async(url,options)=>{
        const prefix='https://api.github.com/repos/owner/site';if(!url.startsWith(prefix))throw Error('Unexpected real network');
        const relative=url.slice(prefix.length),method=options.method;calls.push({relative,method,cache:options.cache});
        const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
          'x-github-request-id':'synthetic-request-id',
          'cache-control':'public, max-age=60, s-maxage=60',
          age:'1',
        }});
        if(method==='GET'&&options.headers.Authorization)throw Error('Unexpected read authentication');
        if(relative==='/deployments?environment=github-pages&per_page=1'){
          reads++;
          const moved=mode==='moved'&&reads>1 || mode==='moved-after-reconcile'&&reads>2;
          return reply([{id:moved?999:501,sha:record.workflowHeadCommit,ref:'main',environment:'github-pages',created_at:mode==='missing-clock'?undefined:mode==='forged-clock'?new Date(Date.parse(record.observedAt)-45000).toISOString():mode==='expired-at-deployment'?new Date(Date.parse(record.observedAt)-20000).toISOString():${JSON.stringify(actual.createdAt)}}]);
        }
        if(relative==='/deployments/501/statuses')return reply([{state:'success',environment_url:record.siteUrl,log_url:'https://github.com/owner/site/actions/runs/101/job/201'}]);
        if(relative.startsWith('/git/ref/tags/')){
          if(refAttempted){
            refReads++;
            const invisibleReads=mode==='delayed-last-read'?3:2;
            if(mode==='never-readable' || mode.startsWith('delayed-')&&refReads<=invisibleReads)return reply({},404);
            if(mode==='ref-forbidden')return reply({},403);
            if(mode==='ref-rate-limited')return reply({},429);
            if(mode==='ref-server-error')return reply({},503);
            if(mode==='ref-timeout')throw new DOMException('Synthetic timeout','TimeoutError');
          }
          return exists?reply({
            ref:mode==='delayed-wrong-ref'?'refs/tags/other':'refs/tags/tsumucode-app-101-501',
            object:{
              type:mode==='delayed-wrong-type'?'commit':'tag',
              sha:(mode==='delayed-wrong-annotation'?'8':'9').repeat(40),
            },
          }):reply({},404);
        }
        if(relative.startsWith('/git/tags/')&&method==='GET'){
          if(mode==='tag-unavailable')return reply({},404);
          const old={...record};
          if(mode==='reuse-observation'){
            old.observedAt=new Date(Date.parse(record.observedAt)-1000).toISOString();
            old.smokeDigest='1'.repeat(64);
          }
          if(mode==='delayed-wrong-candidate')old.candidate={...record.candidate,artifactDigest:'0'.repeat(64)};
          if(mode==='delayed-wrong-qualification')old.qualificationDigest='0'.repeat(64);
          if(mode==='delayed-wrong-smoke')old.smokeDigest='0'.repeat(64);
          return reply({
            tag:mode==='delayed-wrong-tag'?'other':'tsumucode-app-101-501',
            object:{type:'commit',sha:mode==='conflict'||mode==='delayed-wrong-source'?'0'.repeat(40):record.workflowHeadCommit},
            message:mode==='delayed-invalid-message'?'invalid JSON':JSON.stringify(old),
          });
        }
        if(method==='POST'&&options.headers.Authorization!=='Bearer synthetic-write-token')throw Error('Missing synthetic writer');
        if(relative==='/git/tags'&&method==='POST'){if(mode==='uncertain-object')throw Error('synthetic uncertain annotation');return reply({sha:'9'.repeat(40)},201);}
        if(relative==='/git/refs'&&method==='POST'){
          refAttempted=true;
          if(mode==='uncertain-absent')throw Error('synthetic unknown ref');exists=true;
          if(mode==='uncertain-created'||mode==='delayed-lost-response')throw Error('synthetic lost ref response');
          return reply({ref:'refs/tags/tsumucode-app-101-501'},201);
        }
        throw Error('Unexpected API action');
      }; }
    `;
    const file = path.join(root, 'fixed-record.mjs');
    await writeFile(file, mock + code);
    return exec(process.execPath, [file], { cwd: root, env: environment, timeout: 10000 });
  };
  const calls = async () =>
    JSON.parse(await readFile(path.join(root, 'calls.json'), 'utf8')) as {
      relative: string;
      method: string;
      cache?: string;
      delay?: number;
    }[];
  return { root, record, prepared, environment, run, calls };
}
it.each([
  'create',
  'reuse',
  'reuse-observation',
  'uncertain-created',
  'late-create',
  'late-reuse',
  'delayed-created',
  'delayed-lost-response',
  'delayed-last-read',
])('records %s idempotently without executing Source or moving a ref', async (mode) => {
  const row = await setup(mode);
  await row.run();
  expect(
    JSON.parse(await readFile(path.join(row.root, 'record-outcome.json'), 'utf8')),
  ).toMatchObject({ state: 'recorded', tagName: 'tsumucode-app-101-501' });
  const writes = (await row.calls()).filter((call) => call.method === 'POST');
  expect(writes.map((call) => call.relative)).toEqual(
    ['reuse', 'reuse-observation', 'late-reuse'].includes(mode) ? [] : ['/git/tags', '/git/refs'],
  );
  expect(await readFile(path.join(row.root, 'outputs'), 'utf8')).toContain('state=recorded');
  if (mode.startsWith('delayed-')) {
    const calls = await row.calls();
    expect(calls.filter((call) => call.relative.startsWith('/git/ref/tags/'))).toHaveLength(
      mode === 'delayed-last-read' ? 5 : 4,
    );
    expect(calls.filter((call) => call.method === 'WAIT').map((call) => call.delay)).toEqual(
      mode === 'delayed-last-read' ? [1000, 2000, 4000] : [1000, 2000],
    );
  }
});
it.each([
  'conflict',
  'uncertain-object',
  'uncertain-absent',
  'moved',
  'expired-at-deployment',
  'forged-clock',
  'missing-clock',
])('stops %s without blind repeated writes or replacement', async (mode) => {
  const row = await setup(mode);
  await expect(row.run()).rejects.toThrow();
  const writes = (await row.calls()).filter((call) => call.method === 'POST');
  expect(writes.map((call) => call.relative)).toEqual(
    ['conflict', 'expired-at-deployment', 'forged-clock', 'missing-clock'].includes(mode)
      ? []
      : mode === 'uncertain-absent'
        ? ['/git/tags', '/git/refs']
        : ['/git/tags'],
  );
  expect(
    JSON.parse(await readFile(path.join(row.root, 'record-outcome.json'), 'utf8')),
  ).toMatchObject({ state: 'unknown' });
  await expect(readFile(path.join(row.root, 'outputs'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
it.each([
  'never-readable',
  'uncertain-absent',
  'delayed-wrong-ref',
  'delayed-wrong-annotation',
  'delayed-wrong-type',
  'delayed-wrong-tag',
  'delayed-wrong-source',
  'delayed-wrong-candidate',
  'delayed-wrong-qualification',
  'delayed-wrong-smoke',
  'delayed-invalid-message',
  'ref-forbidden',
  'ref-rate-limited',
  'ref-server-error',
  'ref-timeout',
  'tag-unavailable',
  'moved-after-reconcile',
])(
  'leaves %s unknown after one write attempt and bounded read-only reconciliation',
  async (mode) => {
    const row = await setup(mode);
    await expect(row.run()).rejects.toThrow();
    const calls = await row.calls();
    expect(calls.filter((call) => call.method === 'POST').map((call) => call.relative)).toEqual([
      '/git/tags',
      '/git/refs',
    ]);
    const absent = ['never-readable', 'uncertain-absent'].includes(mode);
    const expectedReads = absent ? 5 : mode.startsWith('delayed-') ? 4 : 2;
    expect(calls.filter((call) => call.relative.startsWith('/git/ref/tags/'))).toHaveLength(
      expectedReads,
    );
    expect(calls.filter((call) => call.method === 'WAIT').map((call) => call.delay)).toEqual(
      absent ? [1000, 2000, 4000] : mode.startsWith('delayed-') ? [1000, 2000] : [],
    );
    expect(JSON.parse(await readFile(path.join(row.root, 'record-outcome.json'), 'utf8'))).toEqual({
      schemaVersion: 1,
      state: 'unknown',
      tagName: 'tsumucode-app-101-501',
    });
    await expect(readFile(path.join(row.root, 'outputs'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  },
);
it('reconciles the exact record without caching or exposing writer authorization', async () => {
  const row = await setup('delayed-created');
  const result = await row.run();
  const calls = await row.calls();
  expect(
    calls.filter((call) => call.method === 'GET').every((call) => call.cache === 'no-store'),
  ).toBe(true);
  const observations = result.stdout
    .split('\n')
    .filter((line) => line.startsWith('Record API observation '))
    .map(
      (line) =>
        JSON.parse(line.slice('Record API observation '.length)) as {
          method: string;
          status: number;
        },
    );
  expect(observations.filter((row) => row.method === 'GET').map((row) => row.status)).toEqual([
    404, 404, 404, 200,
  ]);
  expect(observations.filter((row) => row.method === 'POST').map((row) => row.status)).toEqual([
    201, 201,
  ]);
  expect(observations[0]).toEqual({
    method: 'GET',
    resource: '/git/ref/tags/tsumucode-app-101-501',
    status: 404,
    requestId: 'synthetic-request-id',
    cacheControl: 'public, max-age=60, s-maxage=60',
    age: '1',
  });
  expect(result.stdout + result.stderr).not.toContain('synthetic-write-token');
  expect(result.stdout + result.stderr).not.toContain(JSON.stringify(row.record));
});
it.each(['pin', 'extra'])('rejects altered %s data before writes', async (kind) => {
  const row = await setup();
  if (kind === 'pin') row.environment.RECORD_PLAN_SHA256 = '0'.repeat(64);
  else {
    const bytes = Buffer.from(
      JSON.stringify({
        ...row.prepared,
        record: { ...row.record, privateNotes: 'synthetic forbidden notes' },
      }),
    );
    await writeFile(path.join(row.root, '.release-v2/app-record-plan.json'), bytes);
    row.environment.RECORD_PLAN_SHA256 = hashBytes(bytes);
  }
  await expect(row.run()).rejects.toThrow();
  expect((await row.calls()).filter((call) => call.method === 'POST')).toEqual([]);
});
it('runs actual public Browser operations in the existing browser-equipped Docker target', async () => {
  const value = await workflow();
  const target = value.jobs.report.env['TSUMUCODE_DOCKER_TARGET'];
  if (!target) throw Error('Publication observer Docker target is missing');
  const dockerfile = await readFile('Dockerfile', 'utf8');
  const lines = dockerfile.split('\n');
  const stage = lines
    .slice(lines.findIndex((line) => line.endsWith(' AS ' + target)))
    .join('\n')
    .split(/\nFROM /u)[0];
  expect(stage).toContain('playwright install --with-deps chromium');
  expect(value.jobs.report.permissions).toEqual({ contents: 'read' });
  expect(
    value.jobs.report.steps.some((step) => step.run?.includes('release:flow -- public-operations')),
  ).toBe(true);
});
it('keeps record write authority separate from the read-only observer and pinned exact report download', async () => {
  const value = await workflow();
  expect(value.jobs.report.permissions).toEqual({ contents: 'read' });
  expect(value.jobs.record.permissions).toEqual({ contents: 'write' });
  expect(value.jobs.record.needs).toEqual(['deploy', 'report']);
  expect(value.jobs.record.steps.some((step) => /checkout|setup-node/.test(step.uses ?? ''))).toBe(
    false,
  );
  expect(
    value.jobs.record.steps.find(
      (step) => step.with?.['artifact-ids'] === '${{ needs.report.outputs.report_artifact_id }}',
    ),
  ).toBeDefined();
  expect(value.jobs.report.outputs.report_artifact_id).toBe(
    "${{ steps.public_report.outputs['artifact-id'] }}",
  );
});
