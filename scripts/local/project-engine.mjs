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
    // 承認済みの固定5教材だけに限定し、要求から資源上限を選ばせない。
    const memoryMiB = [
      'next-ch02-l01-e01',
      'next-ch03-l01-e01',
      'next-ch03-l02-e01',
      'next-ch05-l01-e01',
      'next-ch06-l01-e01',
    ].includes(record.workspaceId)
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

/** 失敗段階と理由だけを保持し、SourceやDocker例外の本文を診断へ含めない。 */
export class ProjectApplyError extends Error {
  constructor(phase, reason) {
    super('Project apply failed');
    this.phase = phase;
    this.reason = reason;
  }
}

function applyReason(error) {
  if (['deadline', 'socket', 'HTTP', 'identity', 'exit'].includes(error?.applyReason))
    return error.applyReason;
  if (['Docker API timeout', 'Docker API deadline exceeded'].includes(error?.message))
    return 'deadline';
  if (typeof error?.status === 'number') return 'HTTP';
  if (['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(error?.code)) return 'socket';
  return 'unknown';
}

function controlFailure(reason) {
  const error = new Error('Next control failed');
  error.applyReason = reason;
  return error;
}

/** seal済みsocketで固定制御HTTPを確認し、learnerへ追加Node processを起動しない。 */
async function nextControl(applied, socket, path, expected, headers = {}, timeout = 2000) {
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
    throw controlFailure('identity');
  return new Promise((resolve, reject) => {
    const req = request({ socketPath, method: 'GET', path, headers }, (res) => {
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024) res.destroy(controlFailure('HTTP'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(controlFailure('HTTP'));
          return;
        }
        try {
          const marker = JSON.parse(Buffer.concat(chunks).toString());
          if (Object.entries(expected).every(([key, value]) => marker[key] === value))
            resolve(true);
          else reject(controlFailure('identity'));
        } catch {
          reject(controlFailure('identity'));
        }
      });
    });
    const timer = setTimeout(() => req.destroy(controlFailure('deadline')), timeout);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });
}

/** Source配置から実HTTP反映までを単一期限で確認し、失敗したrunは呼び出し側で回収する。 */
export async function applyProject(id, record, runId, transport) {
  const next = record.profile === NEXT_PROFILE;
  const deadline = Date.now() + (next ? PROJECT_LIMITS.startMs : 14000);
  let phase = 'pause';
  const remaining = (maximum) => {
    const value = deadline - Date.now();
    if (value <= 0) throw controlFailure('deadline');
    return Math.min(value, maximum);
  };
  try {
    const metadata = projectMetadata(record, runId);
    const nativeNext = next && Boolean(transport);
    const controlledData =
      next &&
      ['data-cache-revalidation', 'loading-error-not-found'].includes(
        nextWorkspace(record.workspaceId)?.goal,
      );
    if (nativeNext || controlledData) {
      // 同じSourceの再反映でも、固定execのmarker更新前に旧Nextを再起動させない。
      metadata.applyId = randomUUID();
      if (!transport) throw controlFailure('identity');
      await nextControl(
        transport.applied,
        transport.socket,
        '/__tsumucode_pause',
        projectMetadata(transport.applied, runId),
        { 'x-tsumucode-apply-id': metadata.applyId },
        remaining(2000),
      );
    }
    phase = 'exec-create';
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
      remaining(next ? 10000 : 5000),
    );
    phase = 'exec-start';
    await docker(
      'POST',
      `/exec/${execution.Id}/start`,
      { Detach: false, Tty: false },
      remaining(5000),
      true,
    );
    phase = 'exec-inspect';
    const inspected = await docker('GET', `/exec/${execution.Id}/json`, undefined, remaining(2000));
    if (inspected.Running || inspected.ExitCode !== 0) throw controlFailure('exit');
    phase = 'ready';
    do {
      try {
        // sealed socketがあるNextは、compile中に追加Node probeを重ねない。
        const ready = nativeNext
          ? await nextControl(
              transport.applied,
              transport.socket,
              '/__tsumucode_ready',
              metadata,
              {},
              remaining(2000),
            )
          : await probeProject(id, metadata, remaining(PROJECT_LIMITS.probeMs));
        if (ready && Date.now() <= deadline) return;
      } catch (error) {
        // compile中の制御HTTPだけを再試行する。sealやsocketの破損は直ちに回収する。
        if (!nativeNext || !['deadline', 'HTTP'].includes(applyReason(error))) throw error;
      }
      if (!next) throw controlFailure('identity');
      await delay(remaining(100));
    } while (Date.now() < deadline);
    throw controlFailure('deadline');
  } catch (error) {
    throw new ProjectApplyError(phase, applyReason(error));
  }
}

/** learner内部の本物のHTTPを固定execで確認する。stdoutや固定sleepは成功証拠にしない。 */
export async function probeProject(id, expected = {}, timeout = PROJECT_LIMITS.probeMs) {
  const deadline = Date.now() + Math.min(timeout, PROJECT_LIMITS.probeMs);
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
