import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Buffer } from 'node:buffer';
import { setTimeout as sleep } from 'node:timers/promises';
import { PYTHON_EXERCISE_ID, PYTHON_PROFILE_ID, PYTHON_IMAGE, ORIGIN } from './protocol.mjs';
import { docker, containerConfig } from './docker-engine.mjs';

// trusted controller内だけで実行する実Engine診断。管理tokenは出力しない。
let token;
let sequence = 0;
const passed = [];
async function api(path, body = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 4174,
        path: `/api/${path}`,
        method: 'POST',
        headers: {
          host: '127.0.0.1:4173',
          origin: ORIGIN,
          'content-type': 'application/json',
          'content-length': payload.length,
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
    req.setTimeout(12000, () => req.destroy(new Error('API timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}
token = (await api('session')).value.token;
const capability = await api('python-capabilities');
assert.equal(capability.status, 200);
assert.equal(capability.value.engineVersion, '3.14.2');
assert.equal(capability.value.runtimeProfileId, PYTHON_PROFILE_ID);
async function start(source) {
  const runId = `python-acceptance-${Date.now()}-${++sequence}`;
  const input = {
    apiVersion: 1,
    exerciseId: PYTHON_EXERCISE_ID,
    runtimeProfileId: PYTHON_PROFILE_ID,
    contentRevision: capability.value.contentRevision,
    runId,
    exerciseSessionId: 'python-acceptance',
    executionRevision: sequence,
    files: { 'main.py': source },
  };
  const response = await api('runs', input);
  assert.equal(response.status, 202);
  return runId;
}
async function finish(runId) {
  for (let count = 0; count < 150; count += 1) {
    const response = await api(`runs/${runId}`);
    assert.equal(response.status, 200);
    if (response.value.state === 'completed') return response.value.result;
    await sleep(100);
  }
  throw new Error('実CPython runが回収期限を超えました');
}
async function run(source) {
  const result = await finish(await start(source));
  assert.equal(result.engine, 'cpython');
  assert.equal(result.engineVersion, '3.14.2');
  return result;
}
// 専用controller異常終了の前後に実行し、所有孤児だけの回収を確認する。
const restartPhase = process.env.TSUMUCODE_PYTHON_RESTART_PHASE;
if (restartPhase === 'prepare') {
  const config = containerConfig(
    { 'main.py': 'import time\ntime.sleep(30)\n' },
    process.env.TSUMUCODE_LOCAL_OWNER,
    true,
  );
  const created = await docker('POST', '/containers/create', config);
  await docker('POST', `/containers/${created.Id}/start`);
  assert.equal((await docker('GET', `/containers/${created.Id}/json`)).State.Running, true);
  console.log(JSON.stringify({ status: 'prepared', engine: 'cpython' }));
  process.exit(0);
}
if (restartPhase === 'verify') {
  const filters = encodeURIComponent(
    JSON.stringify({
      label: [
        `app.tsumucode.owner=${process.env.TSUMUCODE_LOCAL_OWNER}`,
        'app.tsumucode.role=learner',
      ],
    }),
  );
  assert.equal((await docker('GET', `/containers/json?all=1&filters=${filters}`)).length, 0);
  assert.equal((await run('count = 3\nprint(count)\nprint(count + 2)\n')).status, 'succeeded');
  console.log(
    JSON.stringify({
      status: 'passed',
      engine: 'cpython',
      recovery: 'owned-orphan-removed-and-retried',
    }),
  );
  process.exit(0);
}
const solution = await run('count = 3\nprint(count)\nprint(count + 2)\n');
assert.equal(solution.status, 'succeeded');
assert.equal(solution.stdout, '3\n5\n');
assert.equal(solution.exitCode, 0);
assert.equal(
  solution.evidence.find((row) => row.id === 'python.numeric-variable-printed').value,
  true,
);
assert.equal(
  solution.evidence.find((row) => row.id === 'python.same-variable-addition-printed').value,
  true,
);
passed.push('実CPython版・stdout・2Rule facts');
for (const source of [
  'print(3)\nprint(5)\n',
  'print("3\\n5")\n',
  'print(\'{"supported":true,"numericVariablePrinted":true}\')\n',
]) {
  const result = await run(source);
  assert.equal(result.status, 'succeeded');
  assert.equal(
    result.evidence.find((row) => row.id === 'python.numeric-variable-printed').value,
    false,
  );
}
passed.push('hardcode・文字列・stdout packet偽装はfactsにならない');
const syntax = await run('print(\n');
assert.equal(syntax.status, 'code-error');
assert.equal(syntax.diagnostics[0].kind, 'syntax');
assert.match(syntax.stderr, /SyntaxError/u);
const reference = await run('print(missing)\n');
assert.equal(reference.status, 'code-error');
assert.match(reference.stderr, /NameError/u);
const streams = await run('import sys\nprint("stdout")\nsys.stderr.write("stderr\\n")\n');
assert.equal(streams.status, 'unsupported');
assert.equal(streams.stdout, 'stdout\n');
assert.equal(streams.stderr, 'stderr\n');
assert.equal(streams.exitCode, 0);
const abnormal = await run('import os\nos._exit(7)\n');
assert.equal(abnormal.status, 'code-error');
assert.equal(abnormal.exitCode, 7);
passed.push('構文・実行・異常終了・対応外とstdout/stderrを分離');
const timeout = await run('while True:\n    pass\n');
assert.equal(timeout.status, 'stopped');
assert.equal(timeout.terminationReason, 'timeout');
const memory = await run('data = bytearray(512 * 1024 * 1024)\n');
assert.equal(memory.status, 'stopped');
assert.equal(memory.terminationReason, 'memory-limit');
const output = await run('print("x" * 100000)\n');
assert.equal(output.status, 'stopped');
assert.equal(output.terminationReason, 'output-limit');
assert.ok(Buffer.byteLength(output.stdout) + Buffer.byteLength(output.stderr) <= 65536);
passed.push('実5秒timeout・256MiB memory・64KiB出力上限');
const owner = process.env.TSUMUCODE_LOCAL_OWNER;
const filters = encodeURIComponent(
  JSON.stringify({ label: [`app.tsumucode.owner=${owner}`, 'app.tsumucode.role=learner'] }),
);
const cancelling = await start(
  'import os, time\nif os.fork() == 0:\n    time.sleep(30)\ntime.sleep(30)\n',
);
let learner;
for (let count = 0; count < 30; count += 1) {
  const containers = await docker('GET', `/containers/json?filters=${filters}`);
  for (const container of containers) {
    const inspected = await docker('GET', `/containers/${container.Id}/json`);
    if (inspected.Config.Cmd[5].includes('os.execv')) learner = inspected;
  }
  if (learner) break;
  await sleep(100);
}
assert.ok(learner, '実learnerの起動を観測できません');
assert.equal(learner.Config.Image, PYTHON_IMAGE);
assert.equal(learner.Config.User, '1000:1000');
assert.equal(learner.HostConfig.ReadonlyRootfs, true);
assert.equal(learner.HostConfig.NetworkMode, 'none');
assert.equal(learner.HostConfig.Memory, 268435456);
assert.equal(learner.HostConfig.PidsLimit, 64);
assert.equal(learner.Mounts.filter((mount) => mount.Type === 'bind').length, 0);
assert.deepEqual(learner.HostConfig.CapDrop, ['ALL']);
assert.ok(learner.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
const conflict = await api('runs', {
  apiVersion: 1,
  exerciseId: PYTHON_EXERCISE_ID,
  runtimeProfileId: PYTHON_PROFILE_ID,
  contentRevision: capability.value.contentRevision,
  runId: 'python-conflict',
  exerciseSessionId: 'python-acceptance',
  executionRevision: 1,
  files: { 'main.py': 'print(3)' },
});
assert.equal(conflict.status, 409);
await sleep(150);
const top = await docker('GET', `/containers/${learner.Id}/top`);
assert.ok(top.Processes.length >= 2, '子processを実体で観測できません');
const stopped = await api(`runs/${cancelling}/cancel`);
assert.equal(stopped.value.result.terminationReason, 'cancelled');
await assert.rejects(
  docker('GET', `/containers/${learner.Id}/json`),
  (error) => error.status === 404,
);
passed.push('実非root/none network/no bind制約・排他・子process丸ごとcancel回収');
const isolation = await run(
  'import os, socket\nprint(os.getuid())\nprint(os.path.exists("/var/run/docker.sock"))\nprint(os.path.exists("/workspace/.git"))\nprint(open("/proc/self/status").read())\ntry:\n    open("/forbidden", "w")\nexcept OSError:\n    print("readonly")\ntry:\n    socket.create_connection(("192.0.2.1", 80), 0.1)\nexcept OSError:\n    print("no-network")\n',
);
assert.equal(isolation.status, 'unsupported');
assert.match(isolation.stdout, /^1000\nFalse\nFalse\n/u);
assert.match(isolation.stdout, /Seccomp:\s+2/u);
assert.match(isolation.stdout, /NoNewPrivs:\s+1/u);
assert.match(isolation.stdout, /CapEff:\s+0+/u);
assert.match(isolation.stdout, /readonly\nno-network/u);
passed.push('実UID/cap/seccomp/noNewPrivs・socketなし・root書込/外部通信拒否');
assert.equal((await run('score = 3\nprint(score)\nprint(score + 2)\n')).status, 'succeeded');
assert.equal((await docker('GET', `/containers/json?all=1&filters=${filters}`)).length, 0);
passed.push('停止後の別解再試行・所有learner残0');
console.log(JSON.stringify({ status: 'passed', engine: 'cpython', version: '3.14.2', passed }));
