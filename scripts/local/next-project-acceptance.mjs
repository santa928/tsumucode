import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { docker } from './docker-engine.mjs';
import { NEXT_PROFILE, NEXT_WORKSPACE, nextWorkspace } from './next-project-protocol.mjs';
import { ORIGIN } from './protocol.mjs';
import { TRANSPORT_ROOT } from './preview-contract.mjs';

// controller内の作者検証。外側の固定Fixture packetはshell経由で実行せずSourceとしてAPIへ保存する。
const chunks = [];
let bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  assert.ok(bytes <= 128 * 1024);
  chunks.push(chunk);
}
const fixtures = JSON.parse(Buffer.concat(chunks).toString());
const workspace = process.env.TSUMUCODE_NEXT_WORKSPACE ?? NEXT_WORKSPACE;
const contract = nextWorkspace(workspace);
assert.ok(contract);
const expectedCount = {
  [NEXT_WORKSPACE]: 6,
  'next-ch02-l01-e01': 8,
  'next-ch02-l02-e01': 9,
  'next-ch03-l01-e01': 8,
  'next-ch03-l02-e01': 9,
  'next-ch04-l01-e01': 9,
  'next-ch04-l02-e01': 9,
  'next-ch05-l01-e01': 11,
  'next-ch06-l01-e01': 12,
};
assert.equal(fixtures.length, expectedCount[workspace]);
const owner = process.env.TSUMUCODE_LOCAL_OWNER;
assert.ok(owner);
const path = `/api/workspaces/${workspace}`;
let token;
let saved;
let run;
const passed = [];

function api(path, input = {}) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(input));
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
    req.setTimeout(path.endsWith('/apply') ? 25000 : 15000, () =>
      req.destroy(new Error('Next API deadline')),
    );
    req.on('error', reject);
    req.end(body);
  });
}

const identity = () => ({
  runId: run.runId,
  expectedSourceRevision: saved.sourceRevision,
  expectedSourceHash: saved.sourceHash,
});
async function owned() {
  return docker(
    'GET',
    `/containers/json?all=1&filters=${encodeURIComponent(JSON.stringify({ label: [`app.tsumucode.owner=${owner}`, 'app.tsumucode.role=learner'] }))}`,
  );
}
/** learnerへ追加Nodeを作らず、固定socketから資源の実値を読む。 */
async function resources(verify = true, learnerId, timeout = 2000) {
  const measured = await new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: join(TRANSPORT_ROOT, run.runId, 'http.sock'),
        path: '/__tsumucode_resources',
        signal: globalThis.AbortSignal.timeout(timeout),
      },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 1024) res.destroy(new Error('Resource response limit'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          try {
            assert.equal(res.statusCode, 200);
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(timeout, () => req.destroy(new Error('Resource deadline')));
    req.on('error', reject);
    req.end();
  });
  if (verify) {
    if (measured.zombies > 0 && learnerId) await zombieDiagnostic(learnerId, measured);
    assert.equal(measured.zombies, 0, JSON.stringify(measured));
    assert.equal(measured.memoryEvents.max, 0, JSON.stringify(measured));
    assert.equal(measured.memoryEvents.oom, 0, JSON.stringify(measured));
    assert.equal(measured.memoryEvents.oomKill, 0, JSON.stringify(measured));
    assert.ok(measured.pids <= 64);
    assert.ok(measured.workspaceBytes <= 64 * 1024 * 1024);
    assert.ok(measured.temporaryBytes <= 64 * 1024 * 1024);
  }
  return measured;
}

/** 最初の失敗を保持し、同じlearnerの回収推移だけを1.5秒以内で観測する。 */
async function zombieDiagnostic(learnerId, first) {
  const started = Date.now();
  const remaining = () => Math.max(1, 1500 - (Date.now() - started));
  const [top, inspected] = await Promise.allSettled([
    docker(
      'GET',
      `/containers/${learnerId}/top?ps_args=${encodeURIComponent('-eo pid,ppid,stat')}`,
      undefined,
      Math.min(500, remaining()),
    ),
    docker('GET', `/containers/${learnerId}/json`, undefined, Math.min(500, remaining())),
  ]);
  const pid = (value, parent = false) => {
    const number =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d{1,10}$/u.test(value)
          ? Number(value)
          : NaN;
    return Number.isInteger(number) && number >= (parent ? 0 : 1) && number <= 2147483647
      ? number
      : 'unknown';
  };
  const table = top.status === 'fulfilled' ? top.value : undefined;
  const valid =
    JSON.stringify(table?.Titles) === JSON.stringify(['PID', 'PPID', 'STAT']) &&
    Array.isArray(table.Processes) &&
    table.Processes.length <= 64 &&
    table.Processes.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 3 &&
        pid(row[0]) !== 'unknown' &&
        pid(row[1], true) !== 'unknown' &&
        typeof row[2] === 'string' &&
        row[2].length <= 8 &&
        /^[RSDZTtWXI][<NLsl+]*$/u.test(row[2]),
    );
  const samples = [{ elapsedMs: 0, measured: first }];
  for (let index = 0; index < 3 && Date.now() - started < 1400; index++) {
    await delay(100);
    const measured = await resources(false, undefined, Math.min(500, remaining())).catch(
      () => 'unavailable',
    );
    samples.push({ elapsedMs: Date.now() - started, measured });
  }
  console.error(
    JSON.stringify({
      resourceFailure: 'zombie',
      initPid: inspected.status === 'fulfilled' ? pid(inspected.value?.State?.Pid) : 'unknown',
      processes: valid
        ? table.Processes.map(([processId, parentId, state]) => ({
            pid: pid(processId),
            ppid: pid(parentId, true),
            state,
          }))
        : 'unavailable',
      samples,
    }),
  );
}

async function save(files) {
  const reply = await api(`${path}/source`, {
    expectedSourceRevision: saved?.sourceRevision ?? 0,
    files,
  });
  assert.equal(reply.status, 200, JSON.stringify(reply.value));
  saved = reply.value;
}

async function start() {
  const reply = await api(`${path}/start`, { expectedSourceRevision: saved.sourceRevision });
  assert.equal(reply.status, 202, JSON.stringify(reply.value));
  run = reply.value;
  for (let attempt = 0; attempt < 100; attempt++) {
    saved = (await api(path)).value;
    run = saved.lastRun;
    if (run.state === 'ready') return;
    assert.notEqual(run.state, 'failed', JSON.stringify(saved));
    await delay(200);
  }
  assert.fail('Next HTTP readiness deadline');
}

try {
  token = (await api('/api/session')).value.token;
  const capability = (await api('/api/workspaces/next-capabilities', { workspaceId: workspace }))
    .value;
  assert.equal(capability.profile, NEXT_PROFILE);
  assert.equal(capability.gradingAvailable, true);
  saved = (await api(path)).value;
  if (!saved.files) saved = undefined;
  else if (['starting', 'ready', 'applying'].includes(saved.lastRun?.state)) {
    assert.equal((await api(`${path}/stop`, { runId: saved.lastRun.runId })).status, 200);
  }
  assert.equal(
    (
      await api(`${path}/source`, {
        expectedSourceRevision: saved?.sourceRevision ?? 0,
        files: { ...contract.files, 'next.config.mjs': 'export default {}' },
      })
    ).status,
    400,
  );
  for (const fixture of fixtures) {
    await save(fixture.files);
    if (!run) await start();
    else {
      const applied = await api(`${path}/apply`, identity());
      assert.equal(applied.status, 200, JSON.stringify(applied.value));
      saved = applied.value;
      run = saved.lastRun;
    }
    const learner = (await owned()).find(
      (item) => item.Labels['app.tsumucode.profile'] === NEXT_PROFILE,
    );
    assert.ok(learner);
    const config = await docker('GET', `/containers/${learner.Id}/json`);
    assert.equal(config.Config.User, '1000:1000');
    assert.equal(config.HostConfig.Init, true);
    const expectedMemoryMiB = ['next-ch05-l01-e01', 'next-ch06-l01-e01'].includes(workspace)
      ? 896
      : ['next-ch02-l01-e01', 'next-ch03-l01-e01', 'next-ch03-l02-e01'].includes(workspace)
        ? 576
        : 512;
    assert.equal(config.HostConfig.Memory, expectedMemoryMiB * 1024 * 1024);
    assert.equal(config.HostConfig.MemorySwap, config.HostConfig.Memory);
    assert.ok(config.HostConfig.Memory <= 1_000_000_000);
    assert.equal(config.HostConfig.NanoCpus, 1e9);
    assert.equal(config.HostConfig.PidsLimit, 64);
    assert.equal(config.HostConfig.NetworkMode, 'none');
    assert.equal(config.HostConfig.ReadonlyRootfs, true);
    assert.equal(config.Mounts.length, 1);
    assert.equal(config.Mounts[0].Destination, '/transport');
    const graded = await api(`${path}/grade`, identity());
    if (graded.status !== 200) {
      const lastRun = (await api(path)).value.lastRun;
      const inspected = await docker('GET', `/containers/${learner.Id}/json`).catch(
        () => undefined,
      );
      const measured = await resources().catch(() => undefined);
      assert.fail(
        JSON.stringify({
          fixture: fixture.id,
          grade: graded.value,
          run: { state: lastRun?.state, reason: lastRun?.reason, exitCode: lastRun?.exitCode },
          learner: inspected
            ? {
                running: inspected.State.Running,
                oomKilled: inspected.State.OOMKilled,
                exitCode: inspected.State.ExitCode,
              }
            : 'removed',
          measured,
        }),
      );
    }
    if (graded.value.status !== fixture.expectedStatus) {
      // 作者の失敗時だけ有限分類と実資源を残す。通常の資源検査は弱めない。
      const state = await docker('GET', `/containers/${learner.Id}/json`).catch(() => undefined);
      const logs = await docker(
        'GET',
        `/containers/${learner.Id}/logs?stdout=0&stderr=1&tail=100`,
        undefined,
        2000,
        true,
      ).catch(() => undefined);
      const text = logs?.subarray(-64 * 1024).toString() ?? '';
      console.error(
        JSON.stringify({
          fixture: fixture.id,
          failureResources: await resources(false).catch(() => 'unavailable'),
          learner: state
            ? {
                running: state.State.Running,
                oomKilled: state.State.OOMKilled,
                exitCode: state.State.ExitCode,
              }
            : 'removed',
          nativeFailure: /heap out of memory|Reached heap limit/u.test(text)
            ? 'heap-limit'
            : /ENOSPC|No space left on device/u.test(text)
              ? 'tmpfs-full'
              : 'unknown',
        }),
      );
    }
    assert.equal(
      graded.value.status,
      fixture.expectedStatus,
      JSON.stringify({ fixture: fixture.id, grade: graded.value }),
    );
    if (contract.ruleGoals)
      assert.deepEqual(
        graded.value.projectChecks.map(({ goal, passed }) => ({ goal, passed })),
        fixture.expectedChecks,
        JSON.stringify({ fixture: fixture.id, grade: graded.value }),
      );
    for (const [key, value] of Object.entries({ workspaceId: workspace, ...identity() })) {
      const field =
        key === 'expectedSourceRevision'
          ? 'sourceRevision'
          : key === 'expectedSourceHash'
            ? 'sourceHash'
            : key;
      assert.equal(graded.value[field], value);
    }
    assert.equal(
      (await owned()).filter((item) => item.Labels['app.tsumucode.kind'] === 'grader').length,
      0,
    );
    assert.equal((await docker('GET', `/containers/${learner.Id}/json`)).State.OOMKilled, false);
    const measured = await resources(true, learner.Id);
    passed.push(fixture.id);
    console.log(
      JSON.stringify({
        fixture: fixture.id,
        status: graded.value.status,
        actual: graded.value.actual,
        measured,
      }),
    );
  }
  assert.equal(
    (await api(`${path}/grade`, { ...identity(), expectedSourceHash: 'f'.repeat(64) })).status,
    409,
  );
  const before = saved;
  assert.equal((await api(`${path}/stop`, { runId: run.runId })).status, 200);
  run = undefined;
  saved = (await api(path)).value;
  assert.deepEqual(saved.files, before.files);
  assert.equal(saved.sourceHash, before.sourceHash);
  assert.equal((await owned()).length, 0);
  await save(fixtures.find((fixture) => fixture.id === 'solution').files);
  await start();
  const restarted = await api(`${path}/grade`, identity());
  assert.equal(restarted.value.status, 'pass', JSON.stringify(restarted.value));
  assert.equal((await api(`${path}/stop`, { runId: run.runId })).status, 200);
  run = undefined;
  assert.equal((await owned()).length, 0);
  await save(contract.files);
  console.log(
    JSON.stringify({
      passed,
      boundaries: [
        '固定profile/Source',
        '非root/readonly/networknone/資源',
        '同じSource/runの実DOM+HTTP',
        'grader回収',
        '古い版拒否',
        'Source保持と再起動',
      ],
    }),
  );
} finally {
  if (run) await api(`${path}/stop`, { runId: run.runId }).catch(() => {});
}
