// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { releaseFixture, syntheticPublishedOperations } from './releaseFixture';

const filename = 'release-v2-record-recovery.yml';
const workflowPath = '.github/workflows/' + filename;
const repo = 'santa928/tsumucode',
  repoId = 1303564490,
  source = '2'.repeat(40),
  recovery = '4'.repeat(40);
const run = 44287505917,
  own = 987,
  deploy = 7883955817,
  stepJob = 134822671345,
  workflowId = 891;
const tag = 'tsumucode-app-' + String(run) + '-' + String(deploy),
  annotation = '9'.repeat(40);
const jobIds = [134743951133, 134817595555, 134819093526, 134819366785] as const;
const artifactIds = [14419942359, 14419947400, 14430180591, 14428989313];
const at = (s: number) => new Date(Date.UTC(2025, 10, 18, 13, 0, s)).toISOString();
const names = ['candidate', 'candidate-metadata', 'qualification', 'public-report'];
const dStep = 'Run actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0';
const steps = [
  'Set up job',
  dStep,
  dStep,
  dStep,
  'Record verified deployment without checkout or Source execution',
  'Preserve exact recording outcome',
  'Complete job',
];
type Step = { id?: string; uses?: string; run?: string; with?: Record<string, string> };
async function workflow() {
  return parse(await readFile(workflowPath, 'utf8')) as {
    on: Record<string, unknown>;
    concurrency: Record<string, unknown>;
    jobs: { record: { permissions: Record<string, string>; steps: Step[] } };
  };
}
async function scenario(mode: string) {
  const { snapshot, candidate } = releaseFixture();
  Object.assign(candidate, {
    repository: repo,
    runId: String(run),
    artifactId: String(artifactIds[0]),
  });
  const actual = {
    repository: repo,
    workflowHeadCommit: source,
    runId: String(run),
    deploymentId: String(deploy),
    siteUrl: 'https://santa928.github.io/tsumucode/',
    createdAt: at(20),
  };
  const qualification = {
    status: 'qualified',
    candidateDigest: hashValue(candidate),
    qualifiedAt: at(12),
    technical: {
      candidateDigest: hashValue(candidate),
      status: 'technical-passed',
      buildAttempt: 1,
      verificationAttempts: [1],
      expiresAt: at(mode === 'expired' ? 19 : 40),
    },
  };
  const smoke = {
    status: 'passed',
    candidateDigest: hashValue(candidate),
    artifactDigest: candidate.artifactDigest,
    actual,
    observedAt: at(25),
    checkedFiles: 604,
  };
  const operations = await syntheticPublishedOperations(
    candidate,
    snapshot.inventory,
    actual,
    at(26),
  );
  const coverage = operations.targets.length;
  if (mode === 'coverage') operations.targets.pop();
  const record = {
    schemaVersion: 2,
    state: 'verified',
    repository: repo,
    candidate,
    workflowHeadCommit: source,
    siteUrl: actual.siteUrl,
    deploymentId: String(deploy),
    publicContentDigest: snapshot.publicContent.digest,
    inventoryDigest: hashValue(snapshot.inventory),
    qualificationDigest: hashValue(qualification),
    smokeDigest: hashValue({ bytes: smoke, operations }),
    observedAt: at(27),
  };
  const prepared = {
    schemaVersion: 1,
    state: 'record-plan-only',
    plan: {
      tagName: tag,
      targetCommit: source,
      action: 'create-annotated-record',
      message: JSON.stringify(record),
    },
    record,
  };
  const files = Object.fromEntries(
    Object.entries({
      'metadata/candidate': candidate,
      'metadata/preparation': snapshot,
      'qualification/qualification': qualification,
      'report/public-smoke': smoke,
      'report/public-operations': operations,
      'report/app-record-plan': prepared,
    }).map(([key, value]) => ['.release-v2/' + key + '.json', Buffer.from(JSON.stringify(value))]),
  );
  const filePins = Object.fromEntries(
    Object.entries(files).map(([key, v]) => [key, [v.length, hashBytes(v)]]),
  );
  if (mode === 'file-pin') files['.release-v2/report/public-smoke.json'] = Buffer.from('{}');
  const originalWorkflow = 'original workflow fixture';
  const log =
    'timestamp Error: Missing or ambiguous prior record job\ntimestamp     at ensure (fixture)\ntimestamp     at previousRecordMayHaveRun (fixture)\n';
  const jobs = [
    ['build', 'publish'],
    ['qualification / aggregate', 'publish / deploy', 'publish / report', 'publish / record'],
  ].map((ns, i) =>
    ns.map((name, k) => ({
      name,
      id: (i === 0 ? [jobIds[0], 134797609873] : [...jobIds.slice(1), stepJob])[k]!,
      run_id: run,
      run_attempt: i + 1,
      head_sha: source,
      status: 'completed',
      conclusion:
        name === 'publish' ? 'skipped' : name === 'publish / record' ? 'failure' : 'success',
      started_at: at(0),
      completed_at: at(40),
      steps:
        name === 'publish / record'
          ? steps.map((name, k) => ({
              number: k + 1,
              name,
              status: 'completed',
              conclusion: k === 4 ? 'failure' : 'success',
            }))
          : [],
    })),
  );
  const historyPins = jobs.map((js) =>
    hashValue([...js].sort((a, b) => a.id - b.id).map((j) => [j.id, j.name, j.conclusion])),
  );
  const testPins = {
    source,
    tree: candidate.recipe.sourceTree,
    created: actual.createdAt,
    files: filePins,
    record: hashValue(record),
    workflow: [originalWorkflow.length, hashBytes(Buffer.from(originalWorkflow))],
    log: [log.length, hashBytes(Buffer.from(log))],
    histories: historyPins,
    targets: coverage,
  };
  const ownRun = {
    id: own,
    path: workflowPath,
    workflow_id: workflowId,
    run_number: mode === 'deleted-prior' ? 2 : 1,
    run_attempt: mode === 'rerun' ? 2 : 1,
    status: 'in_progress',
    conclusion: null,
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: recovery,
    repository: { id: repoId, full_name: repo },
    head_repository: { id: repoId, full_name: repo },
  };
  const originalRun = {
    ...ownRun,
    id: run,
    path: '.github/workflows/pages.yml',
    workflow_id: 315500203,
    run_attempt: mode === 'later-original' ? 3 : 2,
    status: 'completed',
    conclusion: 'failure',
    head_sha: source,
  };
  const env = {
    GITHUB_SHA: recovery,
    GITHUB_REPOSITORY: repo,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_RUN_ID: String(own),
    GITHUB_RUN_ATTEMPT: String(ownRun.run_attempt),
    GITHUB_RUN_NUMBER: String(ownRun.run_number),
    GH_TOKEN: 'synthetic',
  };
  let exists = [
      'reuse',
      'conflict',
      'prior-exact',
      'duplicate-member',
      'extra-whitespace',
    ].includes(mode),
    wroteRef = false,
    refReads = 0;
  const posts: string[] = [],
    outcomes: string[] = [];
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
  const mockFetch = async (url: string, init: RequestInit) => {
    const h = new Headers(init.headers),
      prefix = 'https://api.github.com/repos/' + repo;
    if (url === 'https://signed.invalid/log') {
      expect(h.has('authorization')).toBe(false);
      expect(init.redirect).toBe('error');
      return new Response(mode === 'log' ? log + '?' : log);
    }
    if (!url.startsWith(prefix + '/')) throw Error('Unexpected destination');
    const rel = url.slice(prefix.length);
    if (mode === 'read-auth-scope' && init.method === 'GET') {
      expect(h.get('authorization')).toBe(
        rel.startsWith('/deployments') ? null : 'Bearer synthetic',
      );
    }
    if (init.method === 'POST') {
      if (typeof init.body !== 'string') throw Error('Missing POST body');
      const request = JSON.parse(init.body) as Record<string, unknown>;
      posts.push(rel);
      expect(h.get('authorization')).toBe('Bearer synthetic');
      if (rel === '/git/tags') {
        expect(request).toMatchObject({
          tag,
          object: source,
          type: 'commit',
          message: JSON.stringify(record),
        });
        if (mode === 'lost-annotation') throw Error('unknown');
        if (mode === 'malformed-annotation') return json({ sha: annotation }, 201);
        return json({ ...request, sha: annotation, object: { type: 'commit', sha: source } }, 201);
      }
      if (rel === '/git/refs') {
        expect(request).toEqual({ ref: 'refs/tags/' + tag, sha: annotation });
        wroteRef = true;
        exists = mode !== 'lost-absent';
        if (['lost-ref', 'lost-absent', 'delayed'].includes(mode)) throw Error('unknown');
        if (mode === 'conflicting-ref-response')
          return json({ ref: request.ref, object: { type: 'tag', sha: '8'.repeat(40) } }, 201);
        return json({ ref: request.ref, object: { type: 'tag', sha: annotation } }, 201);
      }
      throw Error('unexpected POST');
    }
    if (rel === '/actions/runs/' + String(run))
      return json({
        ...originalRun,
        head_sha: mode === 'original-source' ? '0'.repeat(40) : source,
      });
    if (rel === '/actions/runs/' + String(own))
      return json({
        ...ownRun,
        status: mode === 'changed-after-ref' && wroteRef ? 'completed' : 'in_progress',
      });
    if (rel === '/git/ref/heads/main')
      return json({
        ref: 'refs/heads/main',
        object: {
          type: 'commit',
          sha:
            mode === 'main-moved' || (mode === 'moved-after-tag' && posts.length === 1)
              ? source
              : recovery,
        },
      });
    if (rel.startsWith('/actions/workflows/' + String(workflowId) + '/runs?')) {
      const runs = ['prior', 'prior-exact'].includes(mode)
        ? [ownRun, { ...ownRun, id: 888 }]
        : [ownRun];
      return json({
        total_count: mode === 'truncated-recovery' ? 102 : runs.length,
        workflow_runs: runs,
      });
    }
    if (rel.includes('/attempts/')) {
      const i = rel.includes('/attempts/1/') ? 0 : 1;
      const all = structuredClone(jobs[i]!);
      if (mode === 'wrong-job' && i === 0) all[0]!.head_sha = recovery;
      if (mode === 'producer' && i === 1) all[0]!.conclusion = 'failure';
      if (mode === 'parent-steps' && i === 0)
        all[1]!.steps = [
          { number: 1, name: 'unexpected', status: 'completed', conclusion: 'success' },
        ];
      if (mode === 'child' && i === 0) all.push({ ...all[1]!, id: 8080, name: 'publish / report' });
      if (mode === 'duplicate') all.push(all[0]!);
      if (mode === 'record-steps' && i === 1) all[3]!.steps.pop();
      return json({ total_count: all.length + (mode === 'truncated-jobs' ? 1 : 0), jobs: all });
    }
    if (rel.startsWith('/actions/artifacts/')) {
      const k = artifactIds.indexOf(Number(rel.split('/').at(-1)));
      return json({
        id: artifactIds[k],
        name: names[k]! + '-' + String(run) + '-' + (k < 2 ? '1' : '2'),
        digest:
          'sha256:' +
          (mode === 'archive'
            ? '0'.repeat(64)
            : [
                '579c6d08464e7621a8907ea990d6aa21fc0a337ac0deec5e320b62b720075c05',
                '889307fbc668263d32e0d610e72f826e18959ce0a2b39f4d73ca9963f7487b0c',
                '7a8fa05ef40e6ebb1f5fb037b1de8f0f5519e5b06bcfa250e38174fad7a1d05a',
                '78294a61e7f0e001a3780c56d86ef81b4d7d07a9c17dc75e43c23de2ecbc6f86',
              ][k]!),
        expired: false,
        created_at: at(mode === 'artifact-time' ? 50 : 10),
        workflow_run: {
          id: run,
          head_sha: source,
          head_branch: 'main',
          repository_id: repoId,
          head_repository_id: mode === 'artifact-owner' ? 9 : repoId,
        },
      });
    }
    if (rel === '/contents/.github/workflows/release-v2-publish.yml?ref=' + source)
      return new Response(mode === 'old-workflow' ? 'wrong' : originalWorkflow);
    if (rel === '/actions/jobs/' + String(stepJob) + '/logs') {
      expect(init.redirect).toBe('manual');
      expect(h.get('authorization')).toBe('Bearer synthetic');
      return new Response(null, {
        status: 302,
        headers: {
          location:
            mode === 'insecure-log' ? 'http://signed.invalid/log' : 'https://signed.invalid/log',
        },
      });
    }
    if (rel.startsWith('/deployments?'))
      return json([
        {
          id: mode === 'deployment' ? 9 : deploy,
          sha: source,
          ref: 'main',
          environment: 'github-pages',
          created_at: actual.createdAt,
        },
      ]);
    if (rel.startsWith('/deployments/' + String(deploy) + '/statuses'))
      return json([
        {
          state: 'success',
          environment_url: actual.siteUrl,
          environment: 'github-pages',
          log_url:
            'https://github.com/' +
            repo +
            '/actions/runs/' +
            String(run) +
            '/job/' +
            String(jobIds[2]),
        },
      ]);
    if (rel === '/git/ref/tags/' + tag) {
      if (wroteRef) refReads++;
      if (wroteRef && mode === 'wrong-visible-annotation')
        return json({ ref: 'refs/tags/' + tag, object: { type: 'tag', sha: '8'.repeat(40) } });
      return exists && !(mode === 'delayed' && refReads < 5)
        ? json({ ref: 'refs/tags/' + tag, object: { type: 'tag', sha: annotation } })
        : json({}, 404);
    }
    if (rel === '/git/tags/' + annotation)
      return json({
        sha: annotation,
        tag,
        object: { type: 'commit', sha: source },
        message:
          mode === 'duplicate-member'
            ? '{"state":"conflicting",' + JSON.stringify(record).slice(1)
            : mode === 'extra-whitespace'
              ? JSON.stringify(record) + ' '
              : JSON.stringify(
                  mode === 'conflict' ? { ...record, observedAt: 'different' } : record,
                ),
        tagger: {
          name: 'github-actions[bot]',
          email: '41898282+github-actions[bot]@users.noreply.github.com',
        },
      });
    throw Error('Unexpected API read: ' + rel);
  };
  const step = (await workflow()).jobs.record.steps.find((s) => s.id === 'write_record')!;
  let code = step.run!.split("<<'JS'\n")[1]!.split('\nJS')[0]!;
  // Only replace the fixed pin object in memory, never introduce a runtime override.
  code = code.replace(
    /const PINS = ([\s\S]*?); \/\/ end fixed pins/u,
    (_, literal: string) =>
      'const PINS = ' + JSON.stringify({ ...JSON.parse(literal), ...testPins }) + ';',
  );
  const imports = [...code.matchAll(/^import .*? from '(.*?)';$/gmu)].map((m) => m[1]);
  expect(imports).toEqual(['node:crypto', 'node:fs/promises']);
  code = code.replace(/^import .*?;$/gmu, '');
  // Inject isolated built-ins at the module boundary: no real network, timers, or disk writes.
  const script = new Script('(async()=>{' + code + '})()');
  const go = () =>
    script.runInNewContext({
      createHash,
      Buffer,
      URL,
      AbortSignal,
      console,
      readFile(key: string) {
        if (!(key in files)) throw Error('Unknown local file');
        return files[key];
      },
      writeFile(key: string, value: string) {
        expect(key).toBe('record-outcome.json');
        outcomes.push((JSON.parse(value) as { state: string }).state);
      },
      fetch: mockFetch,
      process: { env },
      setTimeout(f: () => void) {
        f();
      },
    }) as Promise<void>;
  return { go, posts, outcomes, reads: () => refReads };
}
it.each(['create', 'read-auth-scope', 'reuse', 'prior-exact', 'lost-ref', 'delayed'])(
  'recovers only exact original evidence: %s',
  async (mode) => {
    const f = await scenario(mode);
    await f.go();
    expect(f.posts).toEqual(
      ['reuse', 'prior-exact'].includes(mode) ? [] : ['/git/tags', '/git/refs'],
    );
    expect(f.outcomes.at(-1)).toBe('recorded');
    if (mode === 'delayed') expect(f.reads()).toBe(5);
  },
);
it.each([
  'duplicate',
  'truncated-jobs',
  'wrong-job',
  'producer',
  'record-steps',
  'parent-steps',
  'child',
  'later-original',
  'original-source',
  'archive',
  'artifact-owner',
  'artifact-time',
  'file-pin',
  'old-workflow',
  'insecure-log',
  'log',
  'deployment',
  'expired',
  'coverage',
  'conflict',
  'duplicate-member',
  'extra-whitespace',
  'main-moved',
  'prior',
  'rerun',
  'deleted-prior',
  'truncated-recovery',
])('never writes on invalid or ambiguous evidence: %s', async (mode) => {
  const f = await scenario(mode);
  await expect(f.go()).rejects.toThrow();
  expect(f.posts).toEqual([]);
  expect(f.outcomes.at(-1)).toBe('unknown');
});
it.each([
  'lost-annotation',
  'malformed-annotation',
  'lost-absent',
  'conflicting-ref-response',
  'wrong-visible-annotation',
  'moved-after-tag',
  'changed-after-ref',
])('never repeats an uncertain write: %s', async (mode) => {
  const f = await scenario(mode);
  await expect(f.go()).rejects.toThrow();
  expect(f.posts).toEqual(
    ['lost-annotation', 'malformed-annotation', 'moved-after-tag'].includes(mode)
      ? ['/git/tags']
      : ['/git/tags', '/git/refs'],
  );
  expect(f.outcomes.at(-1)).toBe('unknown');
});
it('has only fixed cross-run reads and no deploy, checkout, package install, or selectable inputs', async () => {
  const wf = await workflow();
  expect(wf.on).toEqual({ workflow_dispatch: null });
  expect(wf.concurrency).toEqual({ group: 'pages-release', 'cancel-in-progress': false });
  expect(wf.jobs.record.permissions).toEqual({
    contents: 'write',
    actions: 'read',
  });
  const downloads = wf.jobs.record.steps.filter((s) =>
    s.uses?.startsWith('actions/download-artifact@'),
  );
  expect(downloads.map((s) => String(s.with?.['artifact-ids']))).toEqual(
    artifactIds.slice(1).map(String),
  );
  expect(
    downloads.every((s) => s.with?.repository === repo && String(s.with['run-id']) === String(run)),
  ).toBe(true);
  for (const s of wf.jobs.record.steps)
    if (s.uses) expect(s.uses).toMatch(/^actions\/(?:upload|download)-artifact@[a-f0-9]{40}$/u);
  expect(wf.jobs.record.steps.map((s) => s.run ?? '').join('\n')).not.toMatch(
    /\b(?:npm|pnpm|yarn|child_process|eval)\b/u,
  );
});
