import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import { ORIGIN } from './protocol.mjs';
import { STARTER_FILES } from './project-protocol.mjs';
import { docker, removeContainer } from './docker-engine.mjs';
import { projectImage, projectConfig } from './project-engine.mjs';
import { CONTROL_SOCKET, TRANSPORT_ROOT } from './preview-contract.mjs';

// 専用controllerの再起動前後に実行する。再起動操作は外側のComposeが担当する。
const owner = process.env.TSUMUCODE_LOCAL_OWNER;
const mode = process.env.TSUMUCODE_RESTART_MODE;
assert.ok(['normal', 'abnormal'].includes(mode));
const path = '/api/workspaces/restart-check';
const checkpoint = '/var/lib/tsumucode/workspaces/.restart-check.json';
let token;
async function api(route, input = {}) {
  const body = Buffer.from(JSON.stringify(input));
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'web',
        port: 4173,
        path: route,
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
        res.on('data', (data) => chunks.push(data));
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode, value: JSON.parse(Buffer.concat(chunks).toString()) }),
        );
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error('Restart API timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

for (let i = 0; i < 100; i++) {
  const session = await api('/api/session').catch(() => undefined);
  if (session?.status === 200) {
    token = session.value.token;
    break;
  }
  await delay(200);
}
assert.equal(typeof token, 'string');
if (process.env.TSUMUCODE_RESTART_PHASE === 'prepare') {
  const existing = await api(path);
  assert.ok([200, 404].includes(existing.status));
  const files = {
    ...STARTER_FILES,
    'message.js': `export const message = '${mode}-${Date.now()}';\n`,
  };
  const saved = await api(`${path}/source`, {
    expectedSourceRevision: existing.status === 200 ? existing.value.sourceRevision : 0,
    files,
  });
  assert.equal(saved.status, 200);
  const start = await api(`${path}/start`, { expectedSourceRevision: saved.value.sourceRevision });
  assert.equal(start.status, 202);
  let ready = false;
  for (let i = 0; i < 150; i++) {
    const status = await api(path);
    if (status.value.lastRun?.state === 'ready') {
      ready = true;
      break;
    }
    if (status.value.lastRun?.state === 'failed') throw new Error(status.value.lastRun.reason);
    await delay(200);
  }
  assert.equal(ready, true);
  const image = await projectImage(process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE);
  const orphan = await docker(
    'POST',
    '/containers/create',
    projectConfig({ workspaceId: 'orphan', files: STARTER_FILES }, owner, `orphan-${mode}`, image),
  );
  await docker('POST', `/containers/${orphan.Id}/start`);
  const sentinel = await docker(
    'POST',
    '/containers/create',
    projectConfig(
      { workspaceId: 'sentinel', files: STARTER_FILES },
      `${owner}-restart-sentinel`,
      `sentinel-${mode}`,
      image,
    ),
  );
  await docker('POST', `/containers/${sentinel.Id}/start`);
  await writeFile(
    checkpoint,
    JSON.stringify({
      mode,
      sourceRevision: saved.value.sourceRevision,
      sourceHash: saved.value.sourceHash,
      files,
      runId: start.value.runId,
      sentinel: sentinel.Id,
    }),
  );
  process.stdout.write(`restart-${mode}-prepared\n`);
} else {
  assert.equal(process.env.TSUMUCODE_RESTART_PHASE, 'verify');
  const expected = JSON.parse(await readFile(checkpoint, 'utf8'));
  assert.equal(expected.mode, mode);
  try {
    const record = (await api(path)).value;
    assert.equal(record.sourceRevision, expected.sourceRevision);
    assert.equal(record.sourceHash, expected.sourceHash);
    assert.deepEqual(record.files, expected.files);
    assert.equal(record.lastRun.runId, expected.runId);
    assert.equal(record.lastRun.state, 'stopped');
    assert.equal(
      record.lastRun.reason,
      mode === 'normal' ? 'controller-stopped' : 'controller-restarted',
    );
    const filters = encodeURIComponent(
      JSON.stringify({ label: [`app.tsumucode.owner=${owner}`, 'app.tsumucode.role=learner'] }),
    );
    assert.equal((await docker('GET', `/containers/json?all=1&filters=${filters}`)).length, 0);
    assert.deepEqual(await readdir(TRANSPORT_ROOT), []);
    const previewState = await new Promise((resolve, reject) => {
      const req = request({ socketPath: CONTROL_SOCKET, path: '/active' }, (res) => {
        res.resume();
        res.once('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(previewState, 503);
    assert.equal(
      (await docker('GET', `/containers/${expected.sentinel}/json`)).State.Running,
      true,
    );
    process.stdout.write(`restart-${mode}-source-and-orphan-isolation-passed\n`);
  } finally {
    await removeContainer(expected.sentinel);
  }
}
