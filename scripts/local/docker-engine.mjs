import { request } from 'node:http';
import { Buffer } from 'node:buffer';
import { LIMITS, NODE_IMAGE } from './protocol.mjs';

// learnerへ渡す固定bootstrap。ホストのshellやcontrollerでは学習コードを実行しない。
const BOOTSTRAP = `const fs=require('node:fs');const cp=require('node:child_process');
const files=JSON.parse(Buffer.from(process.argv.slice(1).join(''),'base64').toString('utf8'));
for(const [name,source] of Object.entries(files))fs.writeFileSync('/workspace/'+name,source,{flag:'wx',mode:0o600});
const child=cp.spawn(process.execPath,['/workspace/script.js'],{cwd:'/workspace',stdio:['ignore','inherit','inherit'],env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/workspace',LANG:'C.UTF-8'}});
child.on('error',()=>process.exit(125));child.on('exit',(code,signal)=>process.exit(code??(signal?137:125)));`;

/** 固定Unix socketだけへHTTP要求し、応答をboundedに読む。 */
export function docker(method, path, body, timeout = 20000) {
  return new Promise((resolve, reject) => {
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
              resolve(data.length ? JSON.parse(data.toString()) : undefined);
            } catch (error) {
              reject(error);
            }
          }
        });
      },
    );
    req.setTimeout(timeout, () => req.destroy(new Error('Docker API timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

/** API利用者の指定を混ぜず、固定profileから実コンテナ設定を組み立てる。 */
export function containerConfig(files, owner) {
  return {
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
}

/** Docker multiplex framingを解き、stdout/stderrの総量を外側で制限する。 */
export function followOutput(id, onRecord, onLimit) {
  let req;
  let res;
  let pending = Buffer.alloc(0);
  let total = 0;
  let limited = false;
  const done = new Promise((resolve, reject) => {
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
        res.on('end', resolve);
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
  return {
    done,
    close() {
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
