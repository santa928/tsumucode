import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { API_VERSION, ORIGIN, EXERCISE_ID, PROFILE_ID } from './protocol.mjs';
import { docker } from './docker-engine.mjs';

// Docker内で、実web proxy→実controller→実learnerを確認する診断。token/sourceは出力しない。
let token;
/** API要求を実webへ送り、statusとJSONを分離する。 */
async function api(path, body = {}, extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'web',
        port: 4173,
        path,
        method: 'POST',
        headers: {
          host: '127.0.0.1:4173',
          origin: ORIGIN,
          'content-type': 'application/json',
          'content-length': data.length,
          ...(token ? { 'x-tsumucode-token': token } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, value: text ? JSON.parse(text) : {} });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

token = (await api('/api/session')).value.token;
assert.equal(typeof token, 'string');
const capability = await api('/api/capabilities');
assert.equal(capability.status, 200);
let sequence = 0;
/** 実Node runを開始しpollして完了結果を取得する。 */
async function start(source) {
  const runId = `acceptance-${Date.now()}-${++sequence}`;
  const input = {
    apiVersion: API_VERSION,
    exerciseId: EXERCISE_ID,
    runtimeProfileId: PROFILE_ID,
    contentRevision: capability.value.contentRevision,
    runId,
    exerciseSessionId: 'acceptance',
    executionRevision: sequence,
    files: { 'script.js': source, 'index.html': '', 'styles.css': '' },
  };
  const result = await api('/api/runs', input);
  assert.equal(result.status, 202, JSON.stringify(result));
  return { runId, input };
}
async function finish(runId) {
  for (let i = 0; i < 100; i++) {
    const response = await api(`/api/runs/${runId}`);
    assert.equal(response.status, 200);
    if (response.value.state === 'completed') return response.value.result;
    await sleep(150);
  }
  throw new Error('Run did not complete');
}

for (const headers of [
  { origin: 'null' },
  { origin: 'https://santa928.github.io' },
  { host: 'evil.example' },
  { 'x-tsumucode-token': 'invalid' },
]) {
  const response = await api('/api/capabilities', {}, headers);
  assert.ok([401, 403].includes(response.status));
}
const closure =
  'function createScoreCounter(){let score=0;return function(){score+=10;return score;}}const addScore=createScoreCounter();console.log(addScore());console.log(addScore());';
const ok = await finish((await start(closure)).runId);
assert.equal(ok.status, 'succeeded', JSON.stringify(ok));
assert.equal(ok.stdout, '10\n20\n');
assert.equal(ok.exitCode, 0);
const version = await finish((await start('console.log(process.version);')).runId);
assert.equal(version.stdout.trim(), ok.engineVersion);
const seccomp = await finish(
  (
    await start(
      "console.log(require('node:fs').readFileSync('/proc/self/status','utf8').match(/^Seccomp:\\s*(\\d+)/m)[1]);",
    )
  ).runId,
);
assert.equal(seccomp.stdout.trim(), '2');
const large = await finish((await start('//' + 'a'.repeat(90000) + '\nconsole.log(1);')).runId);
assert.equal(large.status, 'succeeded');
assert.equal(large.stdout, '1\n');
for (const invalid of [
  { command: 'sh' },
  { image: 'other' },
  { contentRevision: 'stale' },
  { files: { '../script.js': 'console.log(1)' } },
]) {
  const response = await api('/api/runs', {
    apiVersion: API_VERSION,
    exerciseId: EXERCISE_ID,
    runtimeProfileId: PROFILE_ID,
    contentRevision: capability.value.contentRevision,
    runId: 'invalid',
    exerciseSessionId: 'acceptance',
    executionRevision: 0,
    files: { 'script.js': '', 'index.html': '', 'styles.css': '' },
    ...invalid,
  });
  assert.ok([400, 409].includes(response.status));
}
const ordinary = await finish(
  (await start('const a=[7];const i=0;Promise.resolve(a[i]).then(console.log);')).runId,
);
assert.equal(ordinary.status, 'succeeded');
assert.equal(ordinary.stdout, '7\n');
const syntax = await finish((await start('const =;')).runId);
assert.equal(syntax.status, 'code-error');
assert.notEqual(syntax.exitCode, 0);
const timeoutRun = await start('while(true){}');
await sleep(250);
const filter = encodeURIComponent(
  JSON.stringify({
    label: [
      `app.tsumucode.owner=${process.env.TSUMUCODE_LOCAL_OWNER}`,
      'app.tsumucode.role=learner',
    ],
  }),
);
const containers = await docker('GET', `/containers/json?all=1&filters=${filter}`);
assert.equal(containers.length, 1);
const inspected = await docker('GET', `/containers/${containers[0].Id}/json`);
assert.equal(inspected.Config.User, '1000:1000');
assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
assert.equal(inspected.HostConfig.NetworkMode, 'none');
assert.equal(inspected.HostConfig.Privileged, false);
assert.equal(inspected.HostConfig.Memory, 256 * 1024 * 1024);
assert.equal(inspected.HostConfig.PidsLimit, 64);
assert.equal(inspected.Mounts.length, 0);
assert.deepEqual(inspected.HostConfig.CapDrop, ['ALL']);
assert.deepEqual(inspected.HostConfig.SecurityOpt, ['no-new-privileges:true', 'seccomp=builtin']);
const busy = await api('/api/runs', { ...timeoutRun.input, runId: 'busy' });
assert.equal(busy.status, 409);
const timeout = await finish(timeoutRun.runId);
assert.equal(timeout.status, 'stopped');
assert.equal(timeout.terminationReason, 'timeout');
const cancelled = await start('while(true){}');
assert.equal(
  (await api(`/api/runs/${cancelled.runId}/cancel`)).value.result.terminationReason,
  'cancelled',
);
const overflow = await finish((await start('while(true)console.log("x".repeat(4096));')).runId);
assert.equal(overflow.terminationReason, 'output-limit');
assert.ok(Buffer.byteLength(overflow.stdout + overflow.stderr) <= 65536);
const binary = await finish((await start('process.stdout.write(Buffer.alloc(65536,255));')).runId);
assert.equal(binary.terminationReason, 'output-limit');
assert.ok(Buffer.byteLength(binary.stdout + binary.stderr) <= 65536);
const memory = await finish(
  (await start('const retained=[]; while(true) retained.push(Buffer.alloc(16*1024*1024, 1));'))
    .runId,
);
assert.equal(memory.status, 'stopped', JSON.stringify(memory));
assert.equal(memory.terminationReason, 'memory-limit');
const children = await start(
  "require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});setInterval(()=>{},1000);",
);
await sleep(500);
const childContainers = await docker('GET', `/containers/json?all=1&filters=${filter}`);
assert.equal(childContainers.length, 1);
const processes = await docker('GET', `/containers/${childContainers[0].Id}/top`);
assert.ok(processes.Processes.length >= 3, 'bootstrap, learner, child must be observed');
assert.equal(
  (await api(`/api/runs/${children.runId}/cancel`)).value.result.terminationReason,
  'cancelled',
);
assert.deepEqual(await docker('GET', `/containers/json?all=1&filters=${filter}`), []);
process.stdout.write(
  JSON.stringify({
    status: 'passed',
    engineVersion: ok.engineVersion,
    closure: ok.stdout,
    preparationMs: ok.preparationMs,
    executionMs: ok.executionMs,
    cases: [
      'auth',
      'closure',
      'computed-index-promise',
      'syntax',
      'inspect-isolation',
      'single-run',
      'timeout',
      'cancel',
      'output-limit',
      'memory-limit',
      'child-process-cancel',
      'cleanup',
    ],
  }) + '\n',
);
