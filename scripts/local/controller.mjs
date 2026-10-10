import console from 'node:console';
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
import {
  PYTHON_EXERCISE_ID,
  PYTHON_PROFILE_ID,
  PYTHON_IMAGE,
  PYTHON_VERSION,
  parsePythonAnalysis,
} from './python-profile.mjs';
import { WorkspaceStore } from './workspace-store.mjs';
import { ProjectApplyError } from './project-engine.mjs';
import { ResidentWorkspace } from './resident-workspace.mjs';
import { PreviewTransport } from './preview-transport.mjs';
import { startPreviewControl } from './preview-control.mjs';
import {
  PROJECT_PROFILE,
  PROJECT_LIMITS,
  STARTER_FILES,
  workspaceId,
  exact,
} from './project-protocol.mjs';

import { NEXT_PROFILE, NEXT_WORKSPACE, nextWorkspace } from './next-project-protocol.mjs';

const owner = process.env.TSUMUCODE_LOCAL_OWNER;
if (!owner || !/^[a-z0-9-]{1,80}$/u.test(owner)) throw new Error('Installation owner is required');
const revision = JSON.parse(await readFile('/app/course-index.json', 'utf8')).revision;
const pythonRevision = JSON.parse(await readFile('/app/python-course-index.json', 'utf8')).revision;
const token = randomBytes(32).toString('hex');
const results = new Map();
let active;
let recoveryNeeded = true;
let readyOperation;
let closing = false;
const store = new WorkspaceStore('/var/lib/tsumucode/workspaces');
const transport = process.env.TSUMUCODE_LOCAL_PREVIEW === '1' ? new PreviewTransport() : undefined;
const resident = new ResidentWorkspace({
  store,
  owner,
  image: process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE,
  graderImage: process.env.TSUMUCODE_LOCAL_GRADER_IMAGE,
  nextImage: process.env.TSUMUCODE_LOCAL_NEXT_IMAGE,
  transport,
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
        if (transport) await transport.recover();
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
    engine: input.runtimeProfileId === PYTHON_PROFILE_ID ? 'cpython' : 'node',
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

/** 1回の実containerを監視し、終了理由を維持して全資源を回収する。 */
async function executePhase(run, analyze = false) {
  const started = performance.now();
  let executionStarted;
  let timeout;
  let output;
  const stdout = [];
  const stderr = [];
  let exitCode = null;
  try {
    if (!run.reason) {
      const container = await docker(
        'POST',
        '/containers/create',
        containerConfig(
          run.input.files,
          owner,
          run.input.runtimeProfileId === PYTHON_PROFILE_ID,
          analyze,
        ),
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
        const outputDone = output.done.catch((error) => {
          run.errorMessage = error.message;
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
        if (inspected.State.OOMKilled && run.reason !== 'system-error') run.reason = 'memory-limit';
      }
    }
  } catch (error) {
    run.errorMessage = error.message;
    run.reason ??= 'system-error';
    recoveryNeeded = true;
  } finally {
    clearTimeout(timeout);
    output?.close();
    if (run.containerId) {
      try {
        await removeContainer(run.containerId);
        run.containerId = undefined;
      } catch (error) {
        run.errorMessage = error.message;
        run.reason = 'system-error';
        recoveryNeeded = true;
      }
    }
  }
  const out = Buffer.from(Buffer.concat(stdout).toString('utf8'));
  const err = Buffer.from(Buffer.concat(stderr).toString('utf8'));
  if (out.length + err.length > LIMITS.outputBytes) run.reason ??= 'output-limit';
  const textOut = new TextDecoder().decode(out.subarray(0, LIMITS.outputBytes), { stream: true });
  const textErr = new TextDecoder().decode(
    err.subarray(0, LIMITS.outputBytes - Buffer.byteLength(textOut)),
    { stream: true },
  );
  return {
    stdout: textOut,
    stderr: textErr,
    exitCode,
    preparationMs: (executionStarted ?? performance.now()) - started,
    executionMs: executionStarted === undefined ? 0 : performance.now() - executionStarted,
  };
}

/** 固定AST解析と学習実行を同じ排他枠に置き、学習者の出力を採点factsにしない。 */
async function execute(run) {
  const python = run.input.runtimeProfileId === PYTHON_PROFILE_ID;
  let facts;
  let preparationMs = 0;
  let executionMs = 0;
  let executed = { stdout: '', stderr: '', exitCode: null };
  try {
    if (python && !run.reason) {
      const analyzed = await executePhase(run, true);
      preparationMs += analyzed.preparationMs;
      executionMs += analyzed.executionMs;
      if (!run.reason)
        facts = parsePythonAnalysis(analyzed.stdout, analyzed.stderr, analyzed.exitCode);
    }
    if (!run.reason) {
      executed = await executePhase(run);
      preparationMs += executed.preparationMs;
      executionMs += executed.executionMs;
    }
  } catch (error) {
    run.errorMessage = error.message;
    run.reason = 'system-error';
  } finally {
    const status =
      run.reason === 'system-error'
        ? 'system-error'
        : run.reason
          ? 'stopped'
          : executed.exitCode !== 0
            ? 'code-error'
            : python && !facts.supported
              ? 'unsupported'
              : 'succeeded';
    const label = python ? 'CPython' : 'Node';
    const diagnostics =
      status === 'succeeded'
        ? []
        : [
            {
              code: `local-${run.reason ?? status}`,
              kind:
                status === 'code-error'
                  ? python && /SyntaxError/u.test(executed.stderr)
                    ? 'syntax'
                    : 'reference'
                  : status === 'unsupported'
                    ? 'unsupported'
                    : 'system',
              severity: 'error',
              message:
                run.errorMessage ?? `${label} termination: ${run.reason ?? executed.exitCode}`,
              learnerMessage:
                status === 'code-error'
                  ? `${label}実行でエラーになりました。エラー出力を確認してください。`
                  : status === 'unsupported'
                    ? 'CPythonで実行しましたが、このLessonの採点は値・変数・加算・printだけに対応します。採点していません。'
                    : status === 'system-error'
                      ? 'ローカル実行環境に接続できません。Dockerと学習モードを確認して再実行してください。編集内容は保持しています。'
                      : `実行を停止しました（${run.reason}）。採点していません。`,
            },
          ];
    const sourceFile = python ? 'main.py' : 'script.js';
    const prefix = python ? 'python' : 'javascript';
    const evidence = [
      {
        id: `${prefix}.executed`,
        value: python ? executed.exitCode === 0 && !run.reason : status === 'succeeded',
      },
      {
        id: `${prefix}.source-sha256`,
        file: sourceFile,
        value: sourceHash(run.input.files[sourceFile]),
      },
    ];
    if (python && status === 'succeeded')
      evidence.push(
        { id: 'python.stdout', value: executed.stdout },
        { id: 'python.version', value: facts.version },
        { id: 'python.numeric-variable-printed', value: facts.numericVariablePrinted },
        { id: 'python.same-variable-addition-printed', value: facts.sameVariableAdditionPrinted },
      );
    if (!python) evidence.push({ id: 'javascript.budget-exhausted', value: status === 'stopped' });
    run.result = {
      ...identity(run.input),
      status,
      diagnostics,
      engineVersion: python ? PYTHON_VERSION : process.version,
      exitCode: executed.exitCode,
      terminationReason: run.reason ?? 'exit',
      stdout: executed.stdout,
      stderr: executed.stderr,
      preparationMs,
      executionMs,
      evidence,
      console: [
        ...executed.stdout
          .split('\n')
          .filter((line, index, lines) => index < lines.length - 1 || line !== '')
          .map((text) => ({ level: 'log', text })),
        ...executed.stderr
          .split('\n')
          .filter((line, index, lines) => index < lines.length - 1 || line !== '')
          .map((text) => ({ level: 'error', text })),
      ].map((record, sequence) => ({ ...record, sequence })),
    };
    run.input = { ...run.input, files: {} };
    // 解析も実行も回収した後にだけ、同じ排他枠を次へ渡す。
    active = undefined;
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
    else if (
      ['/api/workspaces/capabilities', '/api/workspaces/next-capabilities'].includes(req.url)
    ) {
      const next = req.url === '/api/workspaces/next-capabilities';
      const requestedId =
        next && Object.hasOwn(input, 'workspaceId') ? input.workspaceId : NEXT_WORKSPACE;
      exact(input, next && Object.hasOwn(input, 'workspaceId') ? ['workspaceId'] : []);
      const contract = next ? nextWorkspace(requestedId) : undefined;
      if (next && !contract) throw new RequestError(400, '未対応のNext Workspaceです。');
      value = {
        apiVersion: API_VERSION,
        profile: next ? NEXT_PROFILE : PROJECT_PROFILE,
        limits: PROJECT_LIMITS,
        starterFiles: next ? contract.files : STARTER_FILES,
        available: Boolean(
          next ? process.env.TSUMUCODE_LOCAL_NEXT_IMAGE : process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE,
        ),
        gradingAvailable: Boolean(process.env.TSUMUCODE_LOCAL_GRADER_IMAGE && transport),
      };
    } else if (req.url?.startsWith('/api/workspaces/')) {
      if (!process.env.TSUMUCODE_LOCAL_PROJECT_IMAGE)
        throw new RequestError(503, '固定Projectはこのcontrollerで有効ではありません。');
      const matched =
        /^\/api\/workspaces\/([a-z0-9-]+)(?:\/(source|start|stop|reset|activity|apply|grade))?$/u.exec(
          req.url,
        );
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
        case 'apply':
          value = await resident.apply(id, input);
          break;
        case 'grade': {
          const cancellation = new globalThis.AbortController();
          const disconnected = () => {
            if (!res.writableEnded) cancellation.abort();
          };
          res.once('close', disconnected);
          res.once('finish', () => res.off('close', disconnected));
          value = await resident.grade(id, input, cancellation.signal);
          break;
        }
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
    } else if (req.url === '/api/python-capabilities') {
      if (!active) await ready();
      await docker('GET', `/images/${encodeURIComponent(PYTHON_IMAGE)}/json`);
      value = {
        apiVersion: API_VERSION,
        exerciseIds: [PYTHON_EXERCISE_ID],
        contentRevision: pythonRevision,
        runtimeProfileId: PYTHON_PROFILE_ID,
        engineVersion: PYTHON_VERSION,
        limits: LIMITS,
      };
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
      const validated = validateRun(input, revision, pythonRevision);
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
    if (error instanceof ProjectApplyError)
      console.error(
        'Next Source apply failure',
        JSON.stringify({ phase: error.phase, reason: error.reason }),
      );
    res.statusCode = error instanceof RequestError ? error.status : 503;
    res.end(
      JSON.stringify({
        error:
          error instanceof RequestError
            ? error.message
            : error instanceof ProjectApplyError
              ? 'Sourceを反映できませんでした。保存したSourceを確認し、再起動してください。'
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
const previewControl = transport
  ? await startPreviewControl(() => resident.previewTarget())
  : undefined;
/** 正常終了では進行中runを止め、所有する孤児を回収してから終了する。 */
async function shutdown() {
  closing = true;
  server.close();
  previewControl?.close();
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
