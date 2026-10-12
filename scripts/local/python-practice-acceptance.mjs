import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { PracticeRunner } from './python-practice.mjs';
import { docker, removeContainer } from './docker-engine.mjs';

// 作者専用。実controllerと実CPythonへ接続し、生入力やtokenを報告しない。
let token;
let sequence = 0;
const passed = [];
function api(path, body = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 4174,
        path: `/api/${path}`,
        method: 'POST',
        headers: {
          host: '127.0.0.1:4173',
          origin: 'http://127.0.0.1:4173',
          'content-type': 'application/json',
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
    req.setTimeout(12000, () => req.destroy(new Error('practice acceptance timeout')));
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
token = (await api('session')).value.token;
const capability = await api('python-capabilities');
assert.equal(capability.status, 200);
assert.equal(capability.value.fixedFixtureGrading, true);
assert.equal(capability.value.practice.purpose, 'practice');
const input = (
  source,
  exerciseId = 'python-basics-ch01-l02-e01',
  files = { 'main.py': source },
) => ({
  apiVersion: 1,
  exerciseId,
  contentRevision: capability.value.contentRevision,
  runtimeProfileId: 'cpython-values-v1',
  exerciseSessionId: 'practice-acceptance',
  executionRevision: ++sequence,
  files,
});
async function create(source) {
  const response = await api('practice/runs', input(source));
  assert.equal(response.status, 202);
  return response.value;
}
async function until(snapshot, predicate) {
  const deadline = performance.now() + 12000;
  while (performance.now() < deadline) {
    const response = await api(`practice/runs/${snapshot.identity.runId}`, {
      identity: snapshot.identity,
    });
    assert.equal(response.status, 200);
    if (predicate(response.value)) return response.value;
    await delay(20);
  }
  throw new Error('practice state did not settle');
}
async function action(snapshot, name, extra = {}) {
  return api(`practice/runs/${snapshot.identity.runId}/${name}`, {
    identity: snapshot.identity,
    ...extra,
  });
}
async function grade(requestInput) {
  const runId = `fixed-grade-${++sequence}`;
  const response = await api('grades', { ...requestInput, runId });
  assert.equal(response.status, 202);
  for (let index = 0; index < 200; index += 1) {
    const observed = await api(`runs/${runId}`);
    if (observed.value.state === 'completed') return observed.value.result;
    await delay(30);
  }
  throw new Error('fixed grade did not settle');
}

const source = 'name = input()\nprint(name)\n';
let current;
try {
  current = await create(source);
  assert.equal(current.identity.sourceHash, createHash('sha256').update(source).digest('hex'));
  current = await until(current, (value) => value.phase === 'waiting-input');
  assert.equal((await api('grades', { ...input(source), runId: 'while-practice' })).status, 409);
  const stale = { ...current.identity, executionRevision: current.identity.executionRevision + 1 };
  assert.equal(
    (
      await api(`practice/runs/${current.identity.runId}/input`, {
        identity: stale,
        sequence: 1,
        line: 'late',
      })
    ).status,
    409,
  );
  assert.equal(
    (await action(current, 'input', { sequence: 1, line: '実入力非保存196' })).status,
    200,
  );
  assert.equal((await action(current, 'input', { sequence: 1, line: 'double' })).status, 409);
  current = await until(current, (value) => value.reason !== null && value.removed);
  assert.equal(current.purpose, 'practice');
  assert.equal(current.reason, 'completed');
  assert.equal(current.stdout, '実入力非保存196\n');
  assert.equal(Object.hasOwn(current, 'evidence'), false);
  const ack = await action(current, 'ack');
  assert.equal(ack.value.stdout, '');
  assert.equal(ack.value.stderr, '');
  assert.equal(ack.value.purged, true);
  assert.equal((await action(current, 'cancel')).status, 200);
  passed.push('実APIの同run入力・identity・二重送信拒否・練習未採点・ack消去');

  current = await create(source);
  current = await until(current, (value) => value.phase === 'waiting-input');
  await action(current, 'input', { sequence: 1, line: '' });
  current = await until(current, (value) => value.reason !== null && value.removed);
  assert.equal(current.stdout, '\n');
  assert.equal(current.inputCount, 1);
  await action(current, 'ack');
  current = await create(source);
  current = await until(current, (value) => value.phase === 'waiting-input');
  await action(current, 'input', { sequence: 1, eof: true });
  current = await until(current, (value) => value.reason !== null && value.removed);
  assert.equal(current.reason, 'code-error');
  assert.equal(current.inputCount, 0);
  assert.match(current.stderr, /EOFError/u);
  await action(current, 'ack');
  current = await create(source);
  current = await until(current, (value) => value.phase === 'waiting-input');
  const cancelled = await action(current, 'cancel');
  assert.equal(cancelled.value.removed, true);
  assert.equal(cancelled.value.purged, true);
  assert.equal((await action(current, 'input', { sequence: 1, line: 'late' })).status, 409);
  await action(current, 'ack');
  passed.push('実APIの空行/EOF区別・待機中中止・遅延入力拒否と回収');

  const requestInput = input(source);
  assert.equal(
    (await api('grades', { ...requestInput, runId: 'injected-input', inputLines: ['練習値'] }))
      .status,
    400,
  );
  const result = await grade(requestInput);
  assert.equal(result.status, 'succeeded');
  const marker = JSON.parse(
    result.evidence.find((value) => value.id === 'python.fixed-fixtures').value,
  );
  assert.equal(marker.purpose, 'grade');
  assert.equal(marker.sourceHash, createHash('sha256').update(source).digest('hex'));
  assert.deepEqual(
    marker.cases,
    ['name', 'empty', 'unicode'].map((id) => ({ id, status: 'succeeded', outputMatched: true })),
  );
  assert.equal(JSON.stringify(result).includes('実入力非保存196'), false);
  const boundary = await grade(
    input(
      'age = int(input())\nif age > 18:\n    print("adult")\nelse:\n    print("child")\n',
      'python-basics-ch01-l03-e01',
    ),
  );
  const boundaryCases = JSON.parse(
    boundary.evidence.find((value) => value.id === 'python.fixed-fixtures').value,
  ).cases;
  assert.equal(boundaryCases[0].outputMatched, true);
  assert.equal(boundaryCases[1].outputMatched, false);
  const noInput = await grade(
    input('for number in range(3):\n    print(number)\n', 'python-basics-ch01-l04-e01'),
  );
  assert.equal(
    JSON.parse(noInput.evidence.find((value) => value.id === 'python.fixed-fixtures').value).cases
      .length,
    1,
  );
  passed.push('練習入力を拒否する固定別run採点・全ケースAND・境界負例・無入力suite');
  const brokenProject = await grade(
    input('', 'python-basics-ch02-l01-e01', {
      'main.py':
        'from lesson_tools import add, parse_number\ntexts = [input(), input()]\ntotal = 0\nfor text in texts:\n    total = add(total, parse_number(text))\nprint(8)\nprint("終了")\n',
      'lesson_tools.py':
        'def add(left, right):\n    return left + right\n\ndef parse_number(text):\n    return int(text)\n',
    }),
  );
  assert.equal(brokenProject.status, 'code-error');
  assert.match(brokenProject.stderr, /ValueError/u);
  passed.push('早いcaseの出力不一致より、後続caseの未処理例外を優先する');
} finally {
  if (current) await action(current, 'cancel').catch(() => undefined);
}

// DELETEだけを故障させ、実プロセスの停止と削除未確認による排他を別々に検証する。
const owner = `${process.env.TSUMUCODE_LOCAL_OWNER}-practice-fault`;
const bootstrap = await readFile(new URL('./python-practice.py', import.meta.url), 'utf8');
const filters = encodeURIComponent(JSON.stringify({ label: [`app.tsumucode.owner=${owner}`] }));
for (const paused of [false, true]) {
  const runner = new PracticeRunner(owner, bootstrap, (method, path, body, timeout) => {
    if (method === 'DELETE') throw new Error('author injected DELETE failure');
    return docker(method, path, body, timeout);
  });
  try {
    const run = await runner.create(
      input(
        paused
          ? 'input()\n'
          : 'import os\nif os.fork() == 0:\n    while True:\n        pass\nwhile True:\n    pass\n',
      ),
    );
    if (paused) {
      for (let index = 0; index < 200 && run.phase !== 'waiting-input'; index += 1) {
        run.heartbeat(run.identity);
        await delay(10);
      }
      assert.equal(run.phase, 'waiting-input');
    } else await delay(100);
    const id = run.containerId;
    await run.stop('cancelled');
    assert.equal((await docker('GET', `/containers/${id}/json`)).State.Running, false);
    assert.equal(run.stoppedConfirmed, true);
    assert.equal(runner.recoveryNeeded, true);
    assert.equal(run.removed, undefined);
    assert.equal(run.snapshot().stdout, '');
    assert.equal(await run.done, undefined);
    await assert.rejects(runner.create(input('print(1)\n')));
  } finally {
    for (const item of await docker('GET', `/containers/json?all=1&filters=${filters}`))
      await removeContainer(item.Id);
  }
}
passed.push('DELETE故障でもactive子process/paused全体のkill停止を確認・削除未確認は次run拒否');
const lostIdentity = new PracticeRunner(owner, bootstrap, (method, path, body, timeout) => {
  if (method === 'POST' && path === '/containers/create') return Promise.resolve({});
  return docker(method, path, body, timeout);
});
const unknown = await lostIdentity.create(input('input()\n'));
assert.equal(unknown.reason, 'system-error');
assert.equal(lostIdentity.recoveryNeeded, true);
assert.equal(unknown.removed, undefined);
assert.equal(unknown.files, undefined);
await assert.rejects(lostIdentity.create(input('print(1)\n')));
passed.push('create応答にIDがない場合も空検索を回収証明にせず次runを拒否する');
console.log(JSON.stringify({ status: 'passed', engine: 'cpython', checks: passed }));
