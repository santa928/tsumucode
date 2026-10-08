import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { docker, containerConfig } from './docker-engine.mjs';
import { NEXT_PROFILE, nextWorkspace } from './next-project-protocol.mjs';
import { PROJECT_LIMITS, PROJECT_PROFILE } from './project-protocol.mjs';
import { TRANSPORT_ROOT, previewRunId } from './preview-contract.mjs';

const PROBE = `const http = require('node:http');
const expected = JSON.parse(Buffer.from(process.argv[1], 'base64').toString('utf8'));
const req = http.get('http://127.0.0.1:5173/__tsumucode_ready', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    if (data.length > 1024) req.destroy();
  });
  res.on('end', () => {
    try {
      const marker = JSON.parse(data);
      const ready = res.statusCode === 200 && ['vite-project-v1', 'next-project-v1'].includes(marker.profile) &&
        Object.entries(expected).every(([key, value]) => marker[key] === value);
      process.exit(ready ? 0 : 1);
    } catch {
      process.exit(1);
    }
  });
});
req.on('error', () => process.exit(1));
req.setTimeout(1500, () => req.destroy());`;

/** trusted Composeのimageを実IDへ解決し、要求からimage/command/mountを選ばせない。 */
export async function projectImage(image) {
  if (!image || !/^tsumucode-learning-[a-z0-9-]+-(?:next-)?project:local$/u.test(image))
    throw new Error('Project image is not configured');
  const inspected = await docker('GET', `/images/${encodeURIComponent(image)}/json`);
  return inspected.Id;
}

export function projectConfig(record, owner, runId, imageId, preview = false) {
  const config = containerConfig({}, owner);
  config.Image = imageId;
  config.Entrypoint = ['node'];
  config.Cmd = [
    record.profile === NEXT_PROFILE
      ? '/opt/next-project-bootstrap.mjs'
      : '/opt/project-bootstrap.mjs',
    ...Buffer.from(
      JSON.stringify({ files: record.files, metadata: projectMetadata(record, runId), preview }),
    )
      .toString('base64')
      .match(/.{1,16384}/gu),
  ];
  config.Labels = {
    ...config.Labels,
    'app.tsumucode.workspace': record.workspaceId,
    'app.tsumucode.run': runId,
    'app.tsumucode.profile': record.profile ?? PROJECT_PROFILE,
  };
  if (record.profile === NEXT_PROFILE) {
    // Next CLIが生成する孫processもDocker initへ回収させる。
    config.HostConfig.Init = true;
    // データ取得・失敗画面の2教材だけに限定し、要求から資源上限を選ばせない。
    const memoryMiB = ['next-ch03-l01-e01', 'next-ch03-l02-e01'].includes(record.workspaceId)
      ? 576
      : 512;
    config.HostConfig.Memory = memoryMiB * 1024 * 1024;
    config.HostConfig.MemorySwap = config.HostConfig.Memory;
    config.HostConfig.Tmpfs = {
      '/opt/workspace': 'rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=0700',
      '/tmp': 'rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=0700',
    };
    config.WorkingDir = '/opt/workspace';
  }
  if (preview)
    config.HostConfig.Mounts = [
      {
        Type: 'volume',
        Source: `${owner}_transport`,
        Target: '/transport',
        VolumeOptions: { NoCopy: true, Subpath: runId },
      },
    ];
  return config;
}

export function projectMetadata(record, runId) {
  return {
    profile: record.profile ?? PROJECT_PROFILE,
    workspaceId: record.workspaceId,
    runId,
    sourceRevision: record.sourceRevision,
    sourceHash: record.sourceHash,
  };
}

/** seal済みsocketで固定制御HTTPを確認し、learnerへ追加Node processを起動しない。 */
async function nextControl(applied, socket, path, expected, headers = {}) {
  const directory = join(TRANSPORT_ROOT, previewRunId(applied.runId));
  const socketPath = join(directory, 'http.sock');
  const [parent, current] = await Promise.all([lstat(directory), lstat(socketPath)]);
  if (
    !parent.isDirectory() ||
    parent.uid !== 0 ||
    parent.gid !== 1000 ||
    parent.mode & 0o222 ||
    !current.isSocket() ||
    current.uid !== 1000 ||
    current.gid !== 1000 ||
    current.dev !== socket?.dev ||
    current.ino !== socket?.ino
  )
    throw new Error('Invalid sealed Next control socket');
  return new Promise((resolve, reject) => {
    const req = request({ socketPath, method: 'GET', path, headers }, (res) => {
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024) res.destroy(new Error('Next control response limit'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        try {
          const marker = JSON.parse(Buffer.concat(chunks).toString());
          resolve(
            res.statusCode === 200 &&
              Object.entries(expected).every(([key, value]) => marker[key] === value),
          );
        } catch {
          resolve(false);
        }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('Next control deadline')), 2000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}

/** 固定execでSourceを配置し、終了codeと実HTTP反映markerの両方を確認する。 */
export async function applyProject(id, record, runId, transport) {
  const metadata = projectMetadata(record, runId);
  const controlledData =
    record.profile === NEXT_PROFILE &&
    ['data-cache-revalidation', 'loading-error-not-found'].includes(
      nextWorkspace(record.workspaceId)?.goal,
    );
  if (controlledData) {
    // 同じSourceの再反映でも、固定execのmarker更新前に旧Nextを再起動させない。
    metadata.applyId = randomUUID();
    if (
      !transport ||
      !(await nextControl(
        transport.applied,
        transport.socket,
        '/__tsumucode_pause',
        projectMetadata(transport.applied, runId),
        { 'x-tsumucode-apply-id': metadata.applyId },
      ))
    )
      throw new Error('Next pause failed');
  }
  const execution = await docker(
    'POST',
    `/containers/${id}/exec`,
    {
      User: '1000:1000',
      AttachStdout: true,
      AttachStderr: true,
      Cmd: [
        'node',
        '/opt/project-apply.mjs',
        ...Buffer.from(JSON.stringify({ files: record.files, metadata }))
          .toString('base64')
          .match(/.{1,16384}/gu),
      ],
    },
    record.profile === NEXT_PROFILE ? 10000 : 5000,
  );
  await docker('POST', `/exec/${execution.Id}/start`, { Detach: false, Tty: false }, 5000, true);
  const inspected = await docker('GET', `/exec/${execution.Id}/json`, undefined, 2000);
  if (inspected.Running || inspected.ExitCode !== 0) throw new Error('Project apply failed');
  const deadline = Date.now() + (record.profile === NEXT_PROFILE ? 8000 : 0);
  do {
    try {
      const ready = controlledData
        ? await nextControl(transport.applied, transport.socket, '/__tsumucode_ready', metadata)
        : await probeProject(id, metadata);
      if (ready) return;
    } catch (error) {
      if (!controlledData || error.message !== 'Next control deadline') throw error;
    }
    if (Date.now() >= deadline) break;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error('Project apply failed');
}

/** learner内部の本物のHTTPを固定execで確認する。stdoutや固定sleepは成功証拠にしない。 */
export async function probeProject(id, expected = {}) {
  const deadline = Date.now() + PROJECT_LIMITS.probeMs;
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error('HTTP probe deadline exceeded');
    return value;
  };
  const execution = await docker(
    'POST',
    `/containers/${id}/exec`,
    {
      User: '1000:1000',
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['node', '-e', PROBE, Buffer.from(JSON.stringify(expected)).toString('base64')],
    },
    remaining(),
  );
  await docker(
    'POST',
    `/exec/${execution.Id}/start`,
    { Detach: false, Tty: false },
    remaining(),
    true,
  );
  const inspected = await docker('GET', `/exec/${execution.Id}/json`, undefined, remaining());
  return !inspected.Running && inspected.ExitCode === 0;
}
