import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { docker, cleanupOwned, removeContainer, followOutput } from './docker-engine.mjs';
import { PROJECT_LIMITS, STARTER_FILES } from './project-protocol.mjs';
import { ORIGIN, API_VERSION, EXERCISE_ID, PROFILE_ID } from './protocol.mjs';
import { WorkspaceStore } from './workspace-store.mjs';
import { ResidentWorkspace } from './resident-workspace.mjs';
import { projectImage, projectConfig, probeProject } from './project-engine.mjs';

// 専用Composeの実web/controller/learnerを診断する。tokenとSource全文は出力しない。
let token;
async function api(path, input = {}, headers = {}) {
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
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (data) => chunks.push(data));
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode, value: JSON.parse(Buffer.concat(chunks).toString()) }),
        );
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error('Acceptance API timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

async function waitState(id, state) {
  for (let i = 0; i < 150; i++) {
    const result = await api(`/api/workspaces/${id}`);
    assert.equal(result.status, 200);
    if (result.value.lastRun?.state === state) return result.value;
    if (result.value.lastRun?.state === 'failed' && state !== 'failed')
      throw new Error(`Workspace failed: ${result.value.lastRun.reason}`);
    await delay(200);
  }
  throw new Error(`Missing Workspace state ${state}`);
}

async function containers(owner) {
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`app.tsumucode.owner=${owner}`, 'app.tsumucode.role=learner'] }),
  );
  return docker('GET', `/containers/json?all=1&filters=${filters}`);
}

token = (await api('/api/session')).value.token;
const capabilities = (await api('/api/capabilities')).value;
const owner = process.env.TSUMUCODE_LOCAL_OWNER;
const id = `acceptance-${Date.now()}`;
const other = `${id}-other`;
const path = `/api/workspaces/${id}`;
const files = { ...STARTER_FILES, 'message.js': "export const message = 'persistent-source';\n" };
const otherFiles = {
  ...STARTER_FILES,
  'message.js': "export const message = 'other-workspace';\n",
};
const sentinelOwner = `${owner}-sentinel`;
const sentinel = await docker(
  'POST',
  '/containers/create',
  projectConfig(
    { workspaceId: 'sentinel', files: STARTER_FILES },
    sentinelOwner,
    'sentinel',
    await projectImage(process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE),
  ),
);
await docker('POST', `/containers/${sentinel.Id}/start`);
const passed = [];
try {
  for (const headers of [{ origin: 'null' }, { 'x-tsumucode-token': 'invalid' }])
    assert.ok([401, 403].includes((await api(`${path}/source`, {}, headers)).status));
  assert.equal(
    (
      await api(`${path}/source`, {
        expectedSourceRevision: 0,
        files: { ...files, '.env': 'denied' },
      })
    ).status,
    400,
  );
  assert.equal((await api(`${path}/source`, { expectedSourceRevision: 0, files })).status, 200);
  assert.equal(
    (
      await api(`/api/workspaces/${other}/source`, {
        expectedSourceRevision: 0,
        files: otherFiles,
      })
    ).status,
    200,
  );
  const started = await api(`${path}/start`, { expectedSourceRevision: 1 });
  assert.equal(started.status, 202);
  const ready = await waitState(id, 'ready');
  assert.equal(ready.lastRun.sourceHash, ready.sourceHash);
  const learner = (await containers(owner)).find(
    (entry) => entry.Labels['app.tsumucode.run'] === started.value.runId,
  );
  assert.ok(learner);
  const inspected = await docker('GET', `/containers/${learner.Id}/json`);
  assert.equal(inspected.Config.User, '1000:1000');
  assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
  assert.equal(inspected.HostConfig.NetworkMode, 'none');
  assert.equal(inspected.HostConfig.PidsLimit, 64);
  assert.equal(inspected.HostConfig.Memory, 256 * 1024 * 1024);
  assert.equal(inspected.HostConfig.NanoCpus, 1e9);
  assert.deepEqual(inspected.HostConfig.CapDrop, ['ALL']);
  assert.equal(
    inspected.Mounts.filter((mount) => ['bind', 'volume'].includes(mount.Type)).length,
    1,
  );
  assert.equal(inspected.Mounts[0].Destination, '/transport');
  assert.equal(inspected.Mounts[0].Name, `${owner}_transport`);
  assert.equal(inspected.HostConfig.Mounts[0].VolumeOptions.Subpath, started.value.runId);
  assert.ok(inspected.Config.Env.every((entry) => !/TOKEN|SECRET|SOCKET|TSUMUCODE/iu.test(entry)));
  assert.equal(await probeProject(learner.Id), true);
  const controller = await docker('GET', `/containers/${process.env.HOSTNAME}/json`);
  const network = Object.values(controller.NetworkSettings.Networks)[0];
  const boundary = await docker('POST', `/containers/${learner.Id}/exec`, {
    User: '1000:1000',
    AttachStdout: true,
    AttachStderr: true,
    Cmd: [
      'node',
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict';
import { lstat, unlink, rename, symlink, chmod, access } from 'node:fs/promises';
import { createConnection } from 'node:net';
const parent = await lstat('/transport');
assert.equal(parent.uid, 0);
assert.equal(parent.gid, 1000);
assert.equal(parent.mode & 0o777, 0o550);
assert.equal((await lstat('/transport/http.sock')).isSocket(), true);
for (const operation of [
  () => unlink('/transport/http.sock'),
  () => rename('/transport/http.sock', '/transport/replaced'),
  () => symlink('/var/run/docker.sock', '/transport/escape'),
  () => chmod('/transport', 0o770),
]) await assert.rejects(operation(), (error) => ['EACCES', 'EPERM'].includes(error.code));
for (const path of ['/var/run/docker.sock', '/var/run/tsumucode-preview/control.sock',
  '/var/lib/tsumucode/workspaces', '/var/lib/tsumucode/preview-transport',
  '/workspace/.env', '/workspace/.git', '/root/.aws']) {
  await assert.rejects(access(path));
}
for (const [host, port] of ${JSON.stringify([
        [network.IPAddress, 4174],
        [network.Gateway, 4173],
        ['1.1.1.1', 443],
        ['host.docker.internal', 4173],
      ])}) {
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timeout = setTimeout(() => socket.destroy(new Error('bounded-network-denial')), 500);
    socket.once('connect', () => { clearTimeout(timeout); socket.destroy(); reject(new Error('network escaped')); });
    socket.once('error', () => { clearTimeout(timeout); resolve(); });
  });
}
console.log('sealed-transport-and-network-denial');`,
    ],
  });
  await docker('POST', `/exec/${boundary.Id}/start`, { Detach: false, Tty: false }, 5000, true);
  assert.equal((await docker('GET', `/exec/${boundary.Id}/json`)).ExitCode, 0);
  passed.push('real-sealed-socket-tamper-secret-mount-and-network-denials');
  // trusted診断execで子プロセスを作り、run停止がcontainer全体を回収することを確認する。
  const child = await docker('POST', `/containers/${learner.Id}/exec`, {
    User: '1000:1000',
    AttachStdout: true,
    AttachStderr: true,
    Cmd: [
      'node',
      '-e',
      `const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  detached: true, stdio: 'ignore'
});
child.unref();
console.log('resident-child-created');`,
    ],
  });
  await docker('POST', `/exec/${child.Id}/start`, { Detach: false, Tty: false }, 2000, true);
  assert.equal((await docker('GET', `/exec/${child.Id}/json`)).ExitCode, 0);
  const processes = await docker('GET', `/containers/${learner.Id}/top`);
  assert.ok(processes.Processes.some((row) => row.join(' ').includes('setInterval')));
  passed.push('real-http-readiness-and-fixed-container-boundary');

  assert.equal(
    (await api(`/api/workspaces/${other}/start`, { expectedSourceRevision: 1 })).status,
    409,
  );
  assert.equal(
    (
      await api('/api/runs', {
        apiVersion: API_VERSION,
        exerciseId: EXERCISE_ID,
        runtimeProfileId: PROFILE_ID,
        contentRevision: capabilities.contentRevision,
        runId: `busy-${id}`,
        exerciseSessionId: 'acceptance',
        executionRevision: 1,
        files: { 'script.js': '', 'index.html': '', 'styles.css': '' },
      })
    ).status,
    409,
  );
  assert.equal(
    (await api(`${path}/reset`, { expectedSourceRevision: 1, confirmReset: true })).status,
    409,
  );
  const changed = { ...files, 'message.js': "export const message = 'saved-next-run';\n" };
  assert.equal(
    (await api(`${path}/source`, { expectedSourceRevision: 1, files: changed })).status,
    200,
  );
  const active = (await api(path)).value;
  assert.equal(active.sourceRevision, 2);
  assert.equal(active.lastRun.sourceRevision, 1);
  const stopped = await api(`${path}/stop`, { runId: started.value.runId });
  assert.equal(stopped.value.lastRun.state, 'stopped');
  assert.deepEqual(stopped.value.files, changed);
  assert.equal((await containers(owner)).length, 0);
  await assert.rejects(docker('GET', `/containers/${learner.Id}/json`), { status: 404 });
  passed.push('shared-execution-slot-save-stop-and-source-revisions');

  const second = await api(`${path}/start`, { expectedSourceRevision: 2 });
  assert.equal(second.status, 202);
  await waitState(id, 'ready');
  assert.equal((await api(`${path}/stop`, { runId: started.value.runId })).status, 409);
  const running = (await containers(owner))[0];
  await docker('POST', `/containers/${running.Id}/kill`);
  const failed = await waitState(id, 'failed');
  assert.deepEqual(failed.files, changed);
  assert.equal((await containers(owner)).length, 0);
  passed.push('abnormal-exit-cleanup-old-stop-and-source-preservation');

  assert.equal(
    (await api(`${path}/reset`, { expectedSourceRevision: 2, confirmReset: false })).status,
    400,
  );
  const reset = await api(`${path}/reset`, { expectedSourceRevision: 2, confirmReset: true });
  assert.deepEqual(reset.value.files, STARTER_FILES);
  assert.equal(reset.value.sourceRevision, 3);
  assert.deepEqual((await api(`/api/workspaces/${other}`)).value.files, otherFiles);
  assert.equal((await docker('GET', `/containers/${sentinel.Id}/json`)).State.Running, true);
  passed.push('confirmed-reset-and-other-owner-preservation');

  // 実Engineと固定profileは同じで、idleだけ短縮する内部診断。HTTP APIに期限指定はない。
  const diagnosticOwner = `${owner}-diagnostic`;
  const store = new WorkspaceStore('/var/lib/tsumucode/workspaces/diagnostic');
  await cleanupOwned(diagnosticOwner);
  const existing = await store.read('idle').catch((error) => {
    if (error.status !== 404) throw error;
  });
  const source = await store.save('idle', existing?.sourceRevision ?? 0, files);
  let activeRun;
  const engine = {
    docker,
    followOutput,
    cleanupOwned,
    removeContainer,
    projectImage,
    projectConfig,
    probeProject,
  };
  const manager = new ResidentWorkspace({
    store,
    owner: diagnosticOwner,
    image: process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE,
    limits: { ...PROJECT_LIMITS, idleMs: 2000 },
    engine,
    slot: {
      acquire(run) {
        assert.equal(activeRun, undefined);
        activeRun = run;
      },
      release(run) {
        assert.equal(activeRun, run);
        activeRun = undefined;
      },
      async ready() {
        await cleanupOwned(diagnosticOwner);
      },
      recoveryNeeded() {},
    },
  });
  try {
    await manager.start('idle', { expectedSourceRevision: source.sourceRevision });
    let observedReady = false;
    for (let i = 0; i < 100; i++) {
      const record = await manager.status('idle');
      if (record.lastRun.state === 'ready') observedReady = true;
      if (record.lastRun.state === 'idle') break;
      await delay(100);
    }
    assert.equal(observedReady, true);
    assert.equal((await manager.status('idle')).lastRun.state, 'idle');
    assert.equal((await containers(diagnosticOwner)).length, 0);
    assert.deepEqual((await store.read('idle')).files, files);
    passed.push('real-container-idle-cleanup-with-two-second-diagnostic-idle');

    let created;
    let releaseCreate;
    const creation = new Promise((resolve) => {
      created = resolve;
    });
    engine.docker = async (...args) => {
      const value = await docker(...args);
      if (args[1] === '/containers/create') {
        created();
        await new Promise((resolve) => {
          releaseCreate = resolve;
        });
      }
      return value;
    };
    const interrupted = await manager.start('idle', {
      expectedSourceRevision: source.sourceRevision,
    });
    await creation;
    const stopping = manager.stop('idle', { runId: interrupted.runId });
    releaseCreate();
    assert.equal((await stopping).lastRun.state, 'stopped');
    assert.equal((await containers(diagnosticOwner)).length, 0);
    passed.push('real-created-container-interruption-before-start');
  } finally {
    await manager.shutdown();
    await cleanupOwned(diagnosticOwner);
  }
} finally {
  try {
    const status = await api(path);
    if (['starting', 'ready', 'stopping'].includes(status.value.lastRun?.state))
      await api(`${path}/stop`, { runId: status.value.lastRun.runId });
  } finally {
    await cleanupOwned(sentinelOwner);
  }
}
process.stdout.write(
  `${JSON.stringify(
    {
      passed,
      workspaceId: id,
      sourceRevision: 3,
      node: process.version,
      profile: 'vite-project-v1',
    },
    null,
    2,
  )}\n`,
);
