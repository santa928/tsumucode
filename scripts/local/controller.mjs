import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { TextDecoder } from 'node:util';
import { setTimeout, clearTimeout } from 'node:timers';
import {
  API_VERSION,
  EXERCISE_ID,
  EXERCISE_IDS,
  PROFILE_ID,
  NODE_IMAGE,
  LIMITS,
  RequestError,
  authorize,
  validateRun,
  sourceHash,
} from './protocol.mjs';
import {
  docker,
  containerConfig,
  followOutput,
  cleanupOwned,
  removeContainer,
} from './docker-engine.mjs';
import { WorkspaceStore } from './workspace-store.mjs';
import { ResidentWorkspace } from './resident-workspace.mjs';
import {
  PROJECT_PROFILE,
  PROJECT_LIMITS,
  STARTER_FILES,
  workspaceId,
  exact,
} from './project-protocol.mjs';

const owner = process.env.TSUMUCODE_LOCAL_OWNER;
if (!owner || !/^[a-z0-9-]{1,80}$/u.test(owner)) throw new Error('Installation owner is required');
const revision = JSON.parse(await readFile('/app/course-index.json', 'utf8')).revision;
const token = randomBytes(32).toString('hex');
const results = new Map();
let active;
let recoveryNeeded = true;
let readyOperation;
let closing = false;
const store = new WorkspaceStore('/var/lib/tsumucode/workspaces');
const resident = new ResidentWorkspace({
  store,
  owner,
  image: process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE,
  slot: {
    acquire(run) {
      if (closing) throw new RequestError(503, '学習環境を停止しています。');
      if (active) throw new RequestError(409, '実行中です。停止後にもう一度実行してください。');
      active = run;
    },
    release(run) {
      if (active === run) active = undefined;
    },
    ready,
    recoveryNeeded() {
      recoveryNeeded = true;
    },
  },
});

/** Docker切断・controller再起動後も、自身の孤児runだけを実行前に回収する。 */
async function ready() {
  if (!readyOperation) {
    readyOperation = (async () => {
      if (recoveryNeeded) {
        await cleanupOwned(owner);
        // 固定Projectを有効にしたcontrollerだけが永続Sourceを管理する。
        if (process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE) await store.recover();
        if (process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE) await resident.recovered();
        recoveryNeeded = false;
      }
      await docker('GET', `/images/${encodeURIComponent(NODE_IMAGE)}/json`);
    })().finally(() => {
      readyOperation = undefined;
    });
  }
  return readyOperation;
}

/** クライアントのrun identityを全応答へ保持し、教材採点結果は返さない。 */
function identity(input) {
  return {
    runId: input.runId,
    exerciseSessionId: input.exerciseSessionId,
    executionRevision: input.executionRevision,
    backend: 'local',
    engine: 'node',
  };
}

/** 中止理由を先に固定し、コンテナ全体へ停止を要求する。 */
async function cancel(run, reason) {
  run.reason ??= reason;
  if (run.containerId) {
    try {
      await docker('POST', `/containers/${run.containerId}/kill`);
    } catch (error) {
      if (error.status !== 404 && error.status !== 409) throw error;
    }
  }
}

/** 作成・開始・監視・回収までを1つの排他枠で実行し、制限をDockerの外側で強制する。 */
async function execute(run) {
  const started = performance.now();
  let executionStarted;
  let timeout;
  let output;
  const stdout = [];
  const stderr = [];
  let exitCode = null;
  let errorMessage;
  let cleanupSucceeded = false;
  try {
    if (run.reason) return;
    const container = await docker(
      'POST',
      '/containers/create',
      containerConfig(run.input.files, owner),
    );
    run.containerId = container.Id;
    if (!run.reason) {
      await docker('POST', `/containers/${container.Id}/start`);
      executionStarted = performance.now();
      timeout = setTimeout(() => {
        void cancel(run, 'timeout').catch(() => {
          recoveryNeeded = true;
        });
      }, LIMITS.wallMs);
      output = followOutput(
        container.Id,
        (stream, data) => (stream === 2 ? stderr : stdout).push(data),
        () => {
          void cancel(run, 'output-limit').catch(() => {
            recoveryNeeded = true;
          });
        },
      );
      // outputの読取障害も失敗として扱い、未処理rejectionを残さない。
      const outputDone = output.done.catch((error) => {
        errorMessage = error.message;
        run.reason = 'system-error';
        void cancel(run, 'system-error').catch(() => {
          recoveryNeeded = true;
        });
      });
      const waited = await docker(
        'POST',
        `/containers/${container.Id}/wait?condition=not-running`,
        undefined,
        LIMITS.wallMs + 10000,
      );
      clearTimeout(timeout);
      await outputDone;
      exitCode = waited.StatusCode;
      const inspected = await docker('GET', `/containers/${container.Id}/json`);
      if (inspected.State.OOMKilled) run.reason = 'memory-limit';
    }
  } catch (error) {
    errorMessage = error.message;
    run.reason ??= 'system-error';
    recoveryNeeded = true;
  } finally {
    clearTimeout(timeout);
    output?.close();
    if (run.containerId) {
      try {
        await removeContainer(run.containerId);
        cleanupSucceeded = true;
      } catch (error) {
        errorMessage = error.message;
        run.reason = 'system-error';
        recoveryNeeded = true;
      }
    } else cleanupSucceeded = true;
    // 不正UTF-8の置換でbytesが増える場合も、UIへ返すplain textを合計上限内にする。
    const normalizedOut = Buffer.from(Buffer.concat(stdout).toString('utf8'));
    const normalizedErr = Buffer.from(Buffer.concat(stderr).toString('utf8'));
    if (normalizedOut.length + normalizedErr.length > LIMITS.outputBytes)
      run.reason ??= 'output-limit';
    const textOut = new TextDecoder().decode(normalizedOut.subarray(0, LIMITS.outputBytes), {
      stream: true,
    });
    const textErr = new TextDecoder().decode(
      normalizedErr.subarray(0, LIMITS.outputBytes - Buffer.byteLength(textOut)),
      { stream: true },
    );
    const status =
      run.reason === 'system-error'
        ? 'system-error'
        : run.reason
          ? 'stopped'
          : exitCode === 0
            ? 'succeeded'
            : 'code-error';
    const diagnostics =
      status === 'succeeded'
        ? []
        : [
            {
              code: `local-${run.reason ?? 'exit'}`,
              kind: status === 'code-error' ? 'reference' : 'system',
              severity: 'error',
              message: errorMessage ?? `Node termination: ${run.reason ?? exitCode}`,
              learnerMessage:
                status === 'code-error'
                  ? 'Node実行でエラーになりました。エラー出力を確認してください。'
                  : status === 'system-error'
                    ? 'ローカル実行環境に接続できません。Dockerと学習モードを確認して再実行してください。編集内容は保持しています。'
                    : `実行を停止しました（${run.reason}）。採点していません。`,
            },
          ];
    run.result = {
      ...identity(run.input),
      status,
      diagnostics,
      engineVersion: process.version,
      exitCode,
      terminationReason: run.reason ?? 'exit',
      stdout: textOut,
      stderr: textErr,
      preparationMs: (executionStarted ?? performance.now()) - started,
      executionMs: executionStarted === undefined ? 0 : performance.now() - executionStarted,
      evidence: [
        { id: 'javascript.executed', value: status === 'succeeded' },
        { id: 'javascript.budget-exhausted', value: status === 'stopped' },
        {
          id: 'javascript.source-sha256',
          file: 'script.js',
          value: sourceHash(run.input.files['script.js']),
        },
      ],
      console: [
        ...textOut
          .split('\n')
          .filter((line, index, lines) => index < lines.length - 1 || line !== '')
          .map((text) => ({ level: 'log', text })),
        ...textErr
          .split('\n')
          .filter((line, index, lines) => index < lines.length - 1 || line !== '')
          .map((text) => ({ level: 'error', text })),
      ].map((record, sequence) => ({ ...record, sequence })),
    };
    run.input = { ...run.input, files: {} }; // 完了後に学習sourceをcontrollerへ保持しない。
    if (cleanupSucceeded || recoveryNeeded) active = undefined;
  }
}

/** HTTP bodyをboundedに取得し、JSONのみを受け入れる。 */
async function body(req) {
  if (req.headers['content-type'] !== 'application/json')
    throw new RequestError(415, 'JSONが必要です。');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) throw new RequestError(413, '要求が大きすぎます。');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new RequestError(400, 'JSONが不正です。');
  }
}

/** 全APIをsame-origin POSTに限定し、CORSを認証の代用にしない。 */
async function handle(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  try {
    if (req.method !== 'POST') throw new RequestError(405, 'POSTが必要です。');
    authorize(req.headers, token, req.url === '/api/session');
    const input = await body(req);
    if (closing) throw new RequestError(503, '学習環境を停止しています。');
    if (
      req.url !== '/api/runs' &&
      !req.url?.startsWith('/api/workspaces/') &&
      (!input ||
        Array.isArray(input) ||
        typeof input !== 'object' ||
        Object.keys(input).length !== 0)
    ) {
      throw new RequestError(400, 'この要求のbodyは空のobjectにしてください。');
    }
    let value;
    if (req.url === '/api/session') value = { apiVersion: API_VERSION, token };
    else if (req.url === '/api/workspaces/capabilities') {
      exact(input, []);
      value = {
        apiVersion: API_VERSION,
        profile: PROJECT_PROFILE,
        limits: PROJECT_LIMITS,
        starterFiles: STARTER_FILES,
        available: Boolean(process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE),
      };
    } else if (req.url?.startsWith('/api/workspaces/')) {
      if (!process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE)
        throw new RequestError(503, '固定Projectはこのcontrollerで有効ではありません。');
      const matched =
        /^\/api\/workspaces\/([a-z0-9-]+)(?:\/(source|start|stop|reset|activity))?$/u.exec(req.url);
      if (!matched) throw new RequestError(404, 'Workspace APIがありません。');
      const id = workspaceId(matched[1]);
      switch (matched[2]) {
        case 'source':
          value = await resident.save(id, input);
          break;
        case 'start': {
          const cancellation = new globalThis.AbortController();
          const disconnected = () => {
            if (!res.writableEnded) cancellation.abort();
          };
          // proxyの待機期限やBrowser切断後に、IDを渡せないrunを起動し続けない。
          res.once('close', disconnected);
          res.once('finish', () => res.off('close', disconnected));
          value = await resident.start(id, input, cancellation.signal);
          if (closing) throw new RequestError(503, '学習環境を停止しています。');
          res.statusCode = 202;
          break;
        }
        case 'stop':
          value = await resident.stop(id, input);
          break;
        case 'reset':
          value = await resident.reset(id, input);
          break;
        case 'activity':
          value = resident.activity(id, input);
          break;
        default:
          exact(input, []);
          value = await resident.status(id);
      }
    } else if (req.url === '/api/capabilities') {
      if (!active) await ready();
      value = {
        apiVersion: API_VERSION,
        exerciseId: EXERCISE_ID,
        exerciseIds: EXERCISE_IDS,
        contentRevision: revision,
        runtimeProfileId: PROFILE_ID,
        engineVersion: process.version,
        limits: LIMITS,
      };
    } else if (req.url === '/api/runs') {
      const validated = validateRun(input, revision);
      if (active) throw new RequestError(409, '実行中です。停止後にもう一度実行してください。');
      if (results.has(validated.runId))
        throw new RequestError(409, '同じ実行IDは再利用できません。');
      // readyのawait中も別create要求を受け付けない。
      const run = { input: validated };
      active = run;
      const preparation = ready();
      // 準備中のshutdownもdoneを待てるよう、awaitより前に終了promiseを確定する。
      run.done = preparation.then(
        () => {
          if (closing) run.reason ??= 'cancelled';
          return execute(run);
        },
        () => {
          run.reason = 'system-error';
          recoveryNeeded = true;
          return execute(run);
        },
      );
      try {
        await preparation;
      } catch (error) {
        await run.done;
        throw error;
      }
      if (closing) {
        await run.done;
        throw new RequestError(503, '学習環境を停止しています。');
      }
      while (results.size >= 32) results.delete(results.keys().next().value);
      results.set(validated.runId, run);
      value = { ...identity(validated), state: 'running' };
      res.statusCode = 202;
    } else {
      const matched = /^\/api\/runs\/([\w%:.-]+)(\/cancel)?$/u.exec(req.url ?? '');
      if (!matched) throw new RequestError(404, 'APIがありません。');
      const run = results.get(decodeURIComponent(matched[1]));
      if (!run) throw new RequestError(404, '実行結果が見つかりません。');
      if (matched[2] && !run.result) {
        await cancel(run, 'cancelled');
        await run.done;
      }
      value = run.result ? { state: 'completed', result: run.result } : { state: 'running' };
    }
    res.end(JSON.stringify(value));
  } catch (error) {
    res.statusCode = error instanceof RequestError ? error.status : 503;
    res.end(
      JSON.stringify({
        error:
          error instanceof RequestError
            ? error.message
            : 'Dockerへ接続できません。学習モードを確認して再試行してください。',
      }),
    );
  }
}

const server = createServer((req, res) => {
  void handle(req, res);
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
try {
  await ready();
} catch {
  recoveryNeeded = true;
}
server.listen(4174, '0.0.0.0');
/** 正常終了では進行中runを止め、所有する孤児を回収してから終了する。 */
async function shutdown() {
  closing = true;
  server.close();
  try {
    if (active) {
      if (active.workspaceId) await resident.shutdown();
      else {
        await cancel(active, 'cancelled');
        await active?.done;
      }
    }
    await cleanupOwned(owner);
  } finally {
    process.exit(0);
  }
}
process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
