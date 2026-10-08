import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { setTimeout as delay } from 'node:timers/promises';
import { docker, containerConfig, removeContainer } from './docker-engine.mjs';
import { STARTER_FILES } from './project-protocol.mjs';
import { ORIGIN } from './protocol.mjs';

// 作者/CI用。実HTTPの採点、graderの隔離、保存/停止競合を同じ製品APIで確認する。
let token;
async function api(path, input = {}) {
  const body = Buffer.from(JSON.stringify(input));
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
          'content-length': body.length,
          ...(token ? { 'x-tsumucode-token': token } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode, value: JSON.parse(Buffer.concat(chunks).toString()) }),
        );
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error('Grade acceptance timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

const owner = process.env.TSUMUCODE_LOCAL_OWNER;
assert.ok(owner);
const path = `/api/workspaces/grade-${Date.now()}`;
let saved;
let run;
const passed = [];
function gradeInput() {
  return {
    runId: run.runId,
    expectedSourceRevision: saved.sourceRevision,
    expectedSourceHash: saved.sourceHash,
  };
}
async function save(files) {
  const reply = await api(`${path}/source`, {
    expectedSourceRevision: saved?.sourceRevision ?? 0,
    files,
  });
  assert.equal(reply.status, 200);
  saved = reply.value;
}
async function apply(files) {
  await save(files);
  const reply = await api(`${path}/apply`, gradeInput());
  assert.equal(reply.status, 200);
  saved = reply.value;
  run = saved.lastRun;
}
async function owned() {
  return docker(
    'GET',
    `/containers/json?all=1&filters=${encodeURIComponent(JSON.stringify({ label: [`app.tsumucode.owner=${owner}`, 'app.tsumucode.role=learner'] }))}`,
  );
}
async function grader() {
  for (let i = 0; i < 100; i++) {
    const container = (await owned()).find(
      (item) => item.Labels['app.tsumucode.kind'] === 'grader',
    );
    if (container) return docker('GET', `/containers/${container.Id}/json`);
    await delay(50);
  }
  throw new Error('Missing real grader');
}
const sentinelConfig = containerConfig({}, `${owner}-grade-sentinel`);
sentinelConfig.Cmd = ['-e', 'setInterval(()=>{},1000)'];
const sentinel = await docker('POST', '/containers/create', sentinelConfig);
await docker('POST', `/containers/${sentinel.Id}/start`);
try {
  token = (await api('/api/session')).value.token;
  assert.equal((await api('/api/workspaces/capabilities')).value.gradingAvailable, true);
  await save(STARTER_FILES);
  const started = await api(`${path}/start`, { expectedSourceRevision: saved.sourceRevision });
  assert.equal(started.status, 202);
  run = started.value;
  for (let i = 0; i < 100; i++) {
    const reply = await api(path);
    saved = reply.value;
    run = saved.lastRun;
    if (run.state === 'ready') break;
    assert.notEqual(run.state, 'failed');
    await delay(200);
  }
  assert.equal(run.state, 'ready');
  const initial = await api(`${path}/grade`, gradeInput());
  assert.equal(initial.status, 200);
  assert.equal(initial.value.status, 'incomplete', JSON.stringify(initial.value));
  assert.equal(initial.value.actual, 'こんにちは、Workspace！');
  passed.push('初期コードは実DOMで未達成');
  const solution = {
    ...STARTER_FILES,
    'message.js': "export const message = 'こんにちは、実サーバー！';\n",
  };
  await apply(solution);
  const success = await api(`${path}/grade`, gradeInput());
  assert.equal(success.status, 200);
  assert.equal(success.value.status, 'pass', JSON.stringify(success.value));
  for (const [key, value] of Object.entries({
    workspaceId: run.workspaceId,
    runId: run.runId,
    sourceRevision: saved.sourceRevision,
    sourceHash: saved.sourceHash,
  }))
    assert.equal(success.value[key], value);
  assert.match(success.value.engineVersion, /^149\./u);
  assert.equal(
    (await owned()).filter((item) => item.Labels['app.tsumucode.kind'] === 'grader').length,
    0,
  );
  passed.push('実HTTP/Browserの合格と保存/反映identity・回収');
  // watcherの非同期通知に依存せず、反映直後の実DOMが現行版になることを確認する。
  for (const actual of [
    '変更直後',
    'こんにちは、実サーバー！',
    '再変更',
    'こんにちは、実サーバー！',
  ]) {
    await apply({ ...solution, 'message.js': `export const message = '${actual}';\n` });
    const immediate = await api(`${path}/grade`, gradeInput());
    assert.equal(immediate.status, 200);
    assert.equal(immediate.value.actual, actual, JSON.stringify(immediate.value));
    assert.equal(
      immediate.value.status,
      actual === 'こんにちは、実サーバー！' ? 'pass' : 'incomplete',
    );
  }
  await apply({
    ...solution,
    'message.js':
      "throw new Error('learner error'); export const message = 'こんにちは、実サーバー！';\n",
  });
  const codeError = await api(`${path}/grade`, gradeInput());
  assert.equal(codeError.status, 200);
  assert.equal(codeError.value.status, 'code-error');
  assert.ok(codeError.value.diagnostics.some((message) => message.includes('learner error')));
  await apply({ ...solution, 'styles.css': 'h1 { display: none; }\n' });
  const hidden = await api(`${path}/grade`, gradeInput());
  assert.equal(hidden.status, 200);
  assert.equal(hidden.value.status, 'incomplete');
  passed.push('JavaScriptエラーと不可視DOMを合格にしない');
  await apply({
    ...solution,
    'message.js':
      "await new Promise((resolve) => setTimeout(resolve, 2500)); export const message = 'こんにちは、実サーバー！';\n",
  });
  const grading = api(`${path}/grade`, gradeInput());
  const inspected = await grader();
  assert.equal(inspected.Config.User, '1000:1000');
  assert.equal(inspected.HostConfig.NetworkMode, 'none');
  assert.equal(inspected.Config.NetworkDisabled, true);
  assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(inspected.HostConfig.CapDrop, ['ALL']);
  assert.ok(inspected.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
  assert.equal(inspected.HostConfig.NanoCpus, 1e9);
  assert.equal(inspected.HostConfig.Memory, 768 * 1024 * 1024);
  assert.equal(inspected.HostConfig.MemorySwap, inspected.HostConfig.Memory);
  assert.equal(inspected.HostConfig.PidsLimit, 128);
  assert.equal(inspected.Mounts.length, 1);
  assert.equal(inspected.Mounts[0].Name, `${owner}_transport`);
  assert.equal(inspected.Mounts[0].Destination, '/transport');
  assert.equal(inspected.Mounts[0].RW, false);
  assert.equal(inspected.HostConfig.Mounts[0].VolumeOptions.Subpath, run.runId);
  assert.deepEqual(Object.keys(inspected.HostConfig.Tmpfs), ['/tmp']);
  assert.equal(
    inspected.Config.Env.some((value) => /TOKEN|SOURCE|AWS|SECRET|DOCKER/u.test(value)),
    false,
  );
  assert.equal((await api(`${path}/apply`, gradeInput())).status, 409);
  assert.equal((await api(`${path}/grade`, gradeInput())).status, 409);
  await save(solution);
  assert.equal((await grading).status, 409);
  passed.push('実graderの非root/readonly/network-none/資源/mount隔離、採点中保存と重複反映を拒否');
  await apply({
    ...solution,
    'message.js':
      "await new Promise((resolve) => setTimeout(resolve, 30000)); export const message = 'こんにちは、実サーバー！';\n",
  });
  const late = api(`${path}/grade`, gradeInput());
  await grader();
  const stopped = await api(`${path}/stop`, { runId: run.runId });
  assert.equal(stopped.status, 200);
  assert.equal(stopped.value.lastRun.state, 'stopped');
  assert.notEqual((await late).status, 200);
  assert.equal((await owned()).length, 0);
  assert.equal((await docker('GET', `/containers/${sentinel.Id}/json`)).State.Running, true);
  assert.equal((await api(path)).value.sourceHash, saved.sourceHash);
  passed.push('採点中停止/後着拒否/Source保持/他owner保持/learnerとgrader回収');
  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  if (run) await api(`${path}/stop`, { runId: run.runId });
  await removeContainer(sentinel.Id);
}
