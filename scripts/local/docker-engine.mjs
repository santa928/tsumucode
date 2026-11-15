import { request } from 'node:http';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { createHash } from 'node:crypto';
import { constants, writeFileSync, openSync, fstatSync, readSync, closeSync, unlinkSync } from 'node:fs';
import { LIMITS, NODE_IMAGE } from './protocol.mjs';
import { pythonCommand } from './python-profile.mjs';

export const PYTHON_CI_DIAGNOSTIC = '/run/tsumucode-ci-diagnostics/python-exit.json';
const diagnosticHash = (value) => createHash('sha256').update(value).digest('hex');
const diagnosticNumber = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const diagnosticBoolean = (value) => typeof value === 'boolean' ? value : null;
const diagnosticTimeline = (value) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join(',') !==
      'change,die,dieWhen,first,kill,killWhen,oom,oomWhen,second,wait' ||
    !['matched', 'unknown'].includes(value.wait) ||
    !['yes', 'no', 'unknown'].includes(value.first) ||
    !['yes', 'no', 'unknown'].includes(value.second) ||
    !['same', 'unknown'].includes(value.change) ||
    !['oom', 'die', 'kill'].every(
      (key) =>
        ['seen', 'unknown'].includes(value[key]) &&
        ['before', 'near', 'after', 'unknown'].includes(value[`${key}When`]) &&
        (value[key] === 'seen' || value[`${key}When`] === 'unknown'),
    )
  )
    return null;
  const change =
    value.first === 'unknown' || value.second === 'unknown'
      ? 'unknown'
      : value.first === value.second
        ? 'same'
        : 'unknown';
  if (
    value.change !== change ||
    (value.wait !== 'matched' &&
      (value.first !== 'unknown' ||
        value.second !== 'unknown' ||
        ['oom', 'die', 'kill'].some((key) => value[key] !== 'unknown')))
  )
    return null;
  return {
    wait: value.wait,
    first: value.first,
    second: value.second,
    change: value.change,
    oom: value.oom,
    kill: value.kill,
    die: value.die,
    oomWhen: value.oomWhen,
    killWhen: value.killWhen,
    dieWhen: value.dieWhen,
  };
};

/** CI-only observations never change the result and never return raw Docker data. */
export async function observePythonCiExit({
  enabled,
  api,
  id,
  owner,
  inspected,
  waitedCode,
  since,
  until,
  waitAtMs,
}) {
  const matches = (value) =>
    value?.Id === id &&
    value?.Config?.Labels?.['app.tsumucode.owner'] === owner &&
    value?.Config?.Labels?.['app.tsumucode.role'] === 'learner';
  if (
    enabled !== true ||
    typeof api !== 'function' ||
    !/^[a-f0-9]{64}$/u.test(id ?? '') ||
    typeof owner !== 'string' ||
    !owner ||
    !matches(inspected) ||
    !Number.isFinite(since) ||
    !Number.isFinite(until) ||
    until < since ||
    until - since > 30
  )
    return null;
  const flags = {
    wait:
      inspected?.State?.ExitCode === waitedCode && inspected?.State?.Running === false
        ? 'matched'
        : 'unknown',
    first: 'unknown',
    second: 'unknown',
    change: 'unknown',
    oom: 'unknown',
    kill: 'unknown',
    die: 'unknown',
    oomWhen: 'unknown',
    killWhen: 'unknown',
    dieWhen: 'unknown',
  };
  const getFlag = (value) => (value === true ? 'yes' : value === false ? 'no' : 'unknown');
  if (flags.wait !== 'matched') return flags;
  flags.first = getFlag(inspected?.State?.OOMKilled);
  const bounded = async (request) => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(request),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('diagnostic timeout')), 500);
        }),
      ]);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };
  const filters = encodeURIComponent(
    JSON.stringify({ type: ['container'], container: [id], event: ['oom', 'kill', 'die'] }),
  );
  const [after, events] = await Promise.all([
    bounded(() => api('GET', `/containers/${id}/json`, undefined, 450)),
    bounded(() =>
      api('GET', `/events?since=${since}&until=${until}&filters=${filters}`, undefined, 450, true),
    ),
  ]);
  if (matches(after) && after?.State?.Running === false && after?.State?.ExitCode === waitedCode) {
    flags.second = getFlag(after?.State?.OOMKilled);
    if (flags.first !== 'unknown' && flags.second !== 'unknown')
      flags.change = flags.first === flags.second ? 'same' : 'unknown';
  }
  if (Buffer.isBuffer(events) && events.length <= 32768) {
    try {
      const lines = events.toString('utf8').trim();
      const rows = lines ? lines.split('\n').map((line) => JSON.parse(line)) : [];
      if (
        rows.length <= 12 &&
        rows.every(
          (row) =>
            row &&
            row.Type === 'container' &&
            ['oom', 'kill', 'die'].includes(row.Action) &&
            row.status === row.Action &&
            row.id === id &&
            row.Actor?.ID === id &&
            Number.isSafeInteger(row.time) &&
            row.time >= Math.floor(since) &&
            row.time <= Math.ceil(until) &&
            (row.timeNano === undefined ||
              (Number.isFinite(row.timeNano) &&
                Number.isInteger(row.timeNano) &&
                Math.floor(row.timeNano / 1e9) === row.time)),
        )
      ) {
        const seen = new Set();
        for (const row of rows) {
          const key = `${row.Action}When`;
          const eventMs = row.timeNano === undefined ? undefined : Math.floor(row.timeNano / 1e6);
          const when =
            !Number.isSafeInteger(waitAtMs) ||
            waitAtMs < Math.floor(since * 1000) ||
            waitAtMs > Math.ceil(until * 1000) ||
            eventMs === undefined
              ? 'unknown'
              : eventMs < waitAtMs - 1
                ? 'before'
                : eventMs > waitAtMs + 1
                  ? 'after'
                  : 'near';
          flags[key] = seen.has(row.Action) && flags[key] !== when ? 'unknown' : when;
          flags[row.Action] = 'seen';
          seen.add(row.Action);
        }
      }
    } catch {
      /* Unknown is safer than a partial event interpretation. */
    }
  }
  return flags;
}

/** 古い記録を除去できない場合は、以降の読み取りを許可しない。 */
export function preparePythonCiDiagnostic({ enabled, path = PYTHON_CI_DIAGNOSTIC, remove = unlinkSync }) {
  if (enabled !== true) return false;
  try {
    remove(path);
    return true;
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

/** CI専用: learnerに共有しない領域へ、検査IDをハッシュ化して固定項目だけ保存する。 */
export function capturePythonCiDiagnostic({ enabled, path = PYTHON_CI_DIAGNOSTIC, runId, inspected, timeline }) {
  if (enabled !== true) return false;
  try {
    if (typeof runId !== 'string' || runId.length > 160 || runId.length === 0) return false;
    const packet = {
      version: 1,
      runHash: diagnosticHash(runId),
      oom: diagnosticBoolean(inspected?.State?.OOMKilled),
      exit: diagnosticNumber(inspected?.State?.ExitCode),
      memory: diagnosticNumber(inspected?.HostConfig?.Memory),
      swap: diagnosticNumber(inspected?.HostConfig?.MemorySwap),
      errorPresent: typeof inspected?.State?.Error === 'string' ? inspected.State.Error !== '' : null,
    };
    const safeTimeline = diagnosticTimeline(timeline);
    if (safeTimeline) { packet.version = 2; packet.timeline = safeTimeline; }
    const bytes = Buffer.from(JSON.stringify(packet));
    if (bytes.length > 512) return false;
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

/** 元の実行と対応しない・破損した記録を診断結果として返さない。 */
export function readPythonCiDiagnostic({ enabled, path = PYTHON_CI_DIAGNOSTIC, runId }) {
  if (enabled !== true) return null;
  let fd;
  try {
    if (typeof runId !== 'string' || runId.length > 160 || runId.length === 0) return null;
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 512) return null;
    const bytes = Buffer.alloc(513);
    const n = readSync(fd, bytes, 0, bytes.length, 0);
    if (n > 512 || n !== stat.size) return null;
    const packet = JSON.parse(bytes.subarray(0, n).toString());
    if (!packet || ![
      'errorPresent,exit,memory,oom,runHash,swap,version',
      'errorPresent,exit,memory,oom,runHash,swap,timeline,version',
    ].includes(Object.keys(packet).sort().join(',')) ||
        ![1, 2].includes(packet.version) ||
        (packet.version === 1 && 'timeline' in packet) ||
        (packet.version === 2 && !diagnosticTimeline(packet.timeline)) ||
        packet.runHash !== diagnosticHash(runId) ||
        ![true, false, null].includes(packet.oom) || ![true, false, null].includes(packet.errorPresent) ||
        !['exit', 'memory', 'swap'].every((key) => packet[key] === null || diagnosticNumber(packet[key]) === packet[key])) return null;
    const { oom, exit, memory, swap, errorPresent } = packet;
    return { oom, exit, memory, swap, errorPresent, ...(packet.version === 2 ? { timeline: diagnosticTimeline(packet.timeline) } : {}) };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* diagnostics never change execution */ }
  }
}

// learnerへ渡す固定bootstrap。ホストのshellやcontrollerでは学習コードを実行しない。
const BOOTSTRAP = `const fs=require('node:fs');const cp=require('node:child_process');
const files=JSON.parse(Buffer.from(process.argv.slice(1).join(''),'base64').toString('utf8'));
for(const [name,source] of Object.entries(files))fs.writeFileSync('/workspace/'+name,source,{flag:'wx',mode:0o600});
const child=cp.spawn(process.execPath,['/workspace/script.js'],{cwd:'/workspace',stdio:['ignore','inherit','inherit'],env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/workspace',LANG:'C.UTF-8'}});
child.on('error',()=>process.exit(125));child.on('exit',(code,signal)=>process.exit(code??(signal?137:125)));`;

/** 固定Unix socketだけへHTTP要求し、応答をboundedに読む。 */
export function docker(method, path, body, timeout = 20000, raw = false) {
  return new Promise((resolve, reject) => {
    let deadline;
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = request(
      {
        socketPath: '/var/run/docker.sock',
        path: `/v1.47${path}`,
        method,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': payload.length }
          : {},
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) res.destroy(new Error('Docker response limit'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          const data = Buffer.concat(chunks);
          if ((res.statusCode ?? 500) >= 300) {
            const error = new Error(
              `Docker API ${method} ${path.split('?')[0]}: ${res.statusCode}`,
            );
            error.status = res.statusCode;
            reject(error);
          } else {
            try {
              resolve(raw ? data : data.length ? JSON.parse(data.toString()) : undefined);
            } catch (error) {
              reject(error);
            }
          }
        });
      },
    );
    req.setTimeout(timeout, () => req.destroy(new Error('Docker API timeout')));
    deadline = setTimeout(() => req.destroy(new Error('Docker API deadline exceeded')), timeout);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end(payload);
  });
}

/** API利用者の指定を混ぜず、固定profileから実コンテナ設定を組み立てる。 */
export function containerConfig(files, owner, python = false, analyze = false, pythonOptions = {}) {
  const config = {
    Image: NODE_IMAGE,
    User: '1000:1000',
    WorkingDir: '/workspace',
    Entrypoint: ['node'],
    // Linuxの単一argv長上限を超えない固定長に分割する（shellとして解釈しない）。
    Cmd: [
      '-e',
      BOOTSTRAP,
      ...Buffer.from(JSON.stringify(files))
        .toString('base64')
        .match(/.{1,16384}/gu),
    ],
    Env: ['PATH=/usr/local/bin:/usr/bin:/bin', 'HOME=/workspace', 'LANG=C.UTF-8'],
    NetworkDisabled: true,
    Labels: { 'app.tsumucode.owner': owner, 'app.tsumucode.role': 'learner' },
    HostConfig: {
      ReadonlyRootfs: true,
      NetworkMode: 'none',
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true', 'seccomp=builtin'],
      NanoCpus: LIMITS.cpu * 1e9,
      Memory: LIMITS.memoryBytes,
      MemorySwap: LIMITS.memoryBytes,
      PidsLimit: LIMITS.pids,
      Tmpfs: {
        '/workspace': 'rw,noexec,nosuid,nodev,size=8m,uid=1000,gid=1000,mode=0700',
        '/tmp': 'rw,noexec,nosuid,nodev,size=8m,uid=1000,gid=1000,mode=0700',
      },
      Ulimits: [{ Name: 'nofile', Soft: 256, Hard: 256 }],
      LogConfig: {
        Type: 'local',
        Config: { 'max-size': '1m', 'max-file': '1', compress: 'false' },
      },
    },
  };
  return python
    ? {
        ...config,
        ...pythonCommand(files, analyze, pythonOptions.profile, pythonOptions.inputLines),
      }
    : config;
}

/** Docker multiplex framingを解き、stdout/stderrの総量を外側で制限する。 */
export function followOutput(id, onRecord, onLimit, duration = LIMITS.wallMs + 10000) {
  let req;
  let res;
  let deadline;
  let rejectOutput;
  let pending = Buffer.alloc(0);
  let total = 0;
  let limited = false;
  const done = new Promise((resolve, reject) => {
    rejectOutput = reject;
    // streamへ少量のdataが届き続ける場合も、絶対期限で回収処理へ進める。
    deadline = setTimeout(() => {
      reject(new Error('Docker output deadline exceeded'));
      res?.destroy();
      req?.destroy();
    }, duration);
    req = request(
      {
        socketPath: '/var/run/docker.sock',
        path: `/v1.47/containers/${id}/logs?stdout=1&stderr=1&follow=1`,
        method: 'GET',
      },
      (response) => {
        res = response;
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('Docker output unavailable'));
          return;
        }
        res.on('data', (chunk) => {
          pending = Buffer.concat([pending, chunk]);
          while (pending.length >= 8) {
            const length = pending.readUInt32BE(4);
            if (length > 1024 * 1024) {
              res.destroy(new Error('Invalid Docker frame'));
              return;
            }
            if (pending.length < 8 + length) break;
            const stream = pending[0];
            const data = pending.subarray(8, 8 + length);
            pending = pending.subarray(8 + length);
            const available = Math.max(0, LIMITS.outputBytes - total);
            total += data.length;
            if (available > 0) onRecord(stream, data.subarray(0, available));
            if (total > LIMITS.outputBytes && !limited) {
              limited = true;
              onLimit();
            }
          }
        });
        res.on('end', () => {
          if (pending.length > 0) reject(new Error('Truncated Docker output frame'));
          else resolve();
        });
        res.on('aborted', () => reject(new Error('Docker output aborted')));
        res.on('close', () => {
          if (!res.complete) reject(new Error('Docker output closed before completion'));
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
  return {
    done: done.finally(() => clearTimeout(deadline)),
    close() {
      rejectOutput(new Error('Docker output cancelled'));
      res?.destroy();
      req?.destroy();
    },
  };
}

/** この学習installationが所有する資源だけを回収する。global pruneはしない。 */
export async function cleanupOwned(owner) {
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`app.tsumucode.owner=${owner}`, 'app.tsumucode.role=learner'] }),
  );
  const containers = await docker('GET', `/containers/json?all=1&filters=${filters}`);
  for (const container of containers) await removeContainer(container.Id);
}

/** 実行コンテナ全体を強制終了・削除し、子プロセスや一時workspaceも回収する。 */
export async function removeContainer(id) {
  try {
    await docker('DELETE', `/containers/${id}?force=1&v=1`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}
