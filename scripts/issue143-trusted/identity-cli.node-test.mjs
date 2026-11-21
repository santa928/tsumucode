import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
  main = 'a'.repeat(40),
  head = 'b'.repeat(40);
const syntheticHash = createHash('sha256').update('synthetic data').digest('hex');
let guard = await readFile(new URL('./guard.mjs', import.meta.url), 'utf8');
for (const digest of [
  '916497abcb399f2624553292e8ac4d1be2a546452d5a144f190dba5f64ae4e18',
  'cda11e589e968948b8e94a0265eaed7a048f28ffb140467648084ed240a48491',
  '380b46f8bffe0aeebeb19394f0ef2b5c1c23e86004d6965241ed2f6157295698',
])
  guard = guard.replace(digest, syntheticHash);
const dataUrl = 'data:text/javascript;base64,' + Buffer.from(guard).toString('base64');
const cli = (await readFile(new URL('./identity-cli.mjs', import.meta.url), 'utf8')).replace(
  "'./guard.mjs'",
  JSON.stringify(dataUrl),
);
const { execute } = await import(
  'data:text/javascript;base64,' + Buffer.from(cli).toString('base64')
);
const env = () => ({
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: 'santa928/tsumucode',
  GITHUB_ACTOR: 'santa928',
  TRUSTED_WORKFLOW_SHA: main,
  GITHUB_SHA: main,
  GITHUB_EVENT_PATH: '/synthetic-event',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '2',
  IDENTITY_TOKEN: 'PRIVATE_MARKER',
  IDENTITY_MODE: 'pre',
  GITHUB_OUTPUT: '/synthetic',
});
const record = (p, x = {}) =>
  Object.fromEntries(
    Object.entries({
      RESULT: 'success',
      RUN: '123',
      ATTEMPT: '2',
      HEAD: head,
      BASE: main,
      SOURCE: source,
      ...x,
    }).map(([k, v]) => [`${p}_${k}`, v]),
  );
const body = (x) => ({
  ok: true,
  body: (async function* () {
    yield Buffer.from(x);
  })(),
});
function fake(stale = false) {
  let n = 0;
  const calls = [];
  return {
    calls,
    request: async (url, opt) => {
      calls.push({ url, opt });
      n++;
      if (n === 1)
        return body(
          JSON.stringify({
            number: 356,
            state: 'open',
            draft: true,
            head: {
              repo: { full_name: 'santa928/tsumucode' },
              ref: 'codex/issue143-hosted-draft',
              sha: stale ? 'f'.repeat(40) : head,
            },
            base: { repo: { full_name: 'santa928/tsumucode' }, ref: 'main', sha: main },
          }),
        );
      if (n === 2) return body(JSON.stringify({ ref: 'refs/heads/main', object: { sha: main } }));
      if (n === 3)
        return body(
          JSON.stringify([
            { id: 7699435659, sha: source, ref: 'main', environment: 'github-pages' },
          ]),
        );
      if (n === 4)
        return body(
          JSON.stringify([
            {
              state: 'success',
              environment_url: 'https://santa928.github.io/tsumucode/',
              log_url: 'https://github.com/santa928/tsumucode/actions/runs/42929117936/job/1',
            },
          ]),
        );
      return body('synthetic data');
    },
  };
}

test('pre writes only fixed binding and removes token; auth reaches only API', async () => {
  const e = env(),
    f = fake();
  let output = '';
  assert.equal(
    await execute({
      env: e,
      readEvent: async () => head,
      request: f.request,
      write: async (_p, x) => {
        output = x;
      },
    }),
    true,
  );
  assert.equal(e.IDENTITY_TOKEN, undefined);
  assert.equal(f.calls.length, 7);
  assert.equal(output, `run=123\nattempt=2\nhead=${head}\nbase=${main}\nsource=${source}\n`);
  assert.equal(output.includes('PRIVATE_MARKER'), false);
  assert.ok(
    f.calls.slice(0, 4).every((x) => x.opt.headers?.authorization === 'Bearer PRIVATE_MARKER'),
  );
  assert.ok(f.calls.slice(4).every((x) => x.opt.headers === undefined));
});
test('admission refuses failed, canceled, skipped, stale or previous-attempt inputs before any API call', async () => {
  for (const replacement of [
    record('PRE', { ATTEMPT: '1' }),
    record('OBS', { RESULT: 'cancelled' }),
    record('POST', { RESULT: 'skipped' }),
    record('PRE', { HEAD: 'f'.repeat(40) }),
    record('OBS', { BASE: 'f'.repeat(40) }),
    record('POST', { SOURCE: 'f'.repeat(40) }),
  ]) {
    const e = {
        ...env(),
        IDENTITY_MODE: 'admission',
        ...record('PRE'),
        ...record('OBS'),
        ...record('POST'),
        ...replacement,
      },
      f = fake();
    let wrote = false;
    assert.equal(
      await execute({
        env: e,
        readEvent: async () => head,
        request: f.request,
        write: async () => {
          wrote = true;
        },
      }),
      false,
    );
    assert.equal(wrote, false);
    assert.equal(f.calls.length, 0);
    assert.equal(e.IDENTITY_TOKEN, undefined);
  }
});
test('admission requires a new final freshness read even after matching job bindings', async () => {
  const e = {
      ...env(),
      IDENTITY_MODE: 'admission',
      ...record('PRE'),
      ...record('OBS'),
      ...record('POST'),
    },
    f = fake();
  let wrote = false;
  assert.equal(
    await execute({
      env: e,
      readEvent: async () => head,
      request: f.request,
      write: async () => {
        wrote = true;
      },
    }),
    true,
  );
  assert.equal(wrote, true);
  assert.equal(f.calls.length, 7);
});
test('bad ref, exception and missing token fail without writing raw inputs', async () => {
  for (const bad of [{ GITHUB_REF: 'refs/heads/PR' }, { IDENTITY_TOKEN: '' }]) {
    const e = { ...env(), ...bad };
    let wrote = false;
    assert.equal(
      await execute({
        env: e,
        readEvent: async () => head,
        request: async () => {
          throw Error('PRIVATE_MARKER');
        },
        write: async () => {
          wrote = true;
        },
      }),
      false,
    );
    assert.equal(wrote, false);
    assert.equal(e.IDENTITY_TOKEN, undefined);
  }
});

test('event input is bounded and read without leaking or following symlinks', async () => {
  const { readCandidate } = await import('./identity-cli.mjs');
  const { mkdtemp, writeFile, symlink, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const d = await mkdtemp(join(tmpdir(), 'issue143-event-'));
  try {
    const good = join(d, 'good'),
      bad = join(d, 'bad'),
      large = join(d, 'large'),
      link = join(d, 'link');
    await writeFile(
      good,
      JSON.stringify({ inputs: { candidate_sha: head }, secret: 'PRIVATE_MARKER' }),
    );
    await writeFile(bad, 'PRIVATE_MARKER');
    await writeFile(large, Buffer.alloc(65537));
    await symlink(good, link);
    assert.equal(await readCandidate(good), head);
    for (const p of [bad, large, link, join(d, 'missing')]) await assert.rejects(readCandidate(p));
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('admission rejects a head that changed after previously successful jobs', async () => {
  const e = {
      ...env(),
      IDENTITY_MODE: 'admission',
      ...record('PRE'),
      ...record('OBS'),
      ...record('POST'),
    },
    f = fake(true);
  let wrote = false;
  assert.equal(
    await execute({
      env: e,
      readEvent: async () => head,
      request: f.request,
      write: async () => {
        wrote = true;
      },
    }),
    false,
  );
  assert.equal(wrote, false);
  assert.equal(f.calls.length, 1);
});
