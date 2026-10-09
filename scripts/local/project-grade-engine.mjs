import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { docker, containerConfig, removeContainer } from './docker-engine.mjs';
import { nextWorkspace } from './next-project-protocol.mjs';
import { projectMetadata } from './project-engine.mjs';
import { RequestError } from './protocol.mjs';

// Dockerの多重化ヘッダーを検証し、分割されたstderr行も一度だけ連結する。
function gradeOutput(output, limit = 64 * 1024) {
  if (!Buffer.isBuffer(output) || output.length > limit) throw new Error('Grade output limit');
  const streams = { 1: [], 2: [] };
  let offset = 0;
  while (offset < output.length) {
    if (output.length - offset < 8) throw new Error('Invalid grade output');
    const channel = output[offset];
    if (!streams[channel] || output.readUIntBE(offset + 1, 3) !== 0)
      throw new Error('Invalid grade output channel');
    const length = output.readUInt32BE(offset + 4);
    if (offset + 8 + length > output.length) throw new Error('Invalid grade output');
    streams[channel].push(output.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  return {
    stdout: Buffer.concat(streams[1]).toString(),
    stderr: Buffer.concat(streams[2]).toString(),
  };
}

function gradeProgress(stderr) {
  return [
    ...stderr.matchAll(
      /^TSUMUCODE_GRADE_STEP:(marker-before|form-reserve|browser-launch|initial-navigation|initial-idle|observations|project-structure|project-filter|project-presentation|form-invalid|form-first-send|form-retry|form-inspect|form-response-headers|form-response-body|form-response-dom|form-reset-before|form-reset-after|form-document-unchanged|form-document-changed|marker-after|browser-close|form-release):(\d{1,6})\n/gmu,
    ),
  ]
    .slice(-32)
    .map((match) => ({ phase: match[1], elapsedMs: Number(match[2]) }));
}

/** 同じURLへの各POSTの終端を、固定連番・分類・時間だけで区別する。 */
function formResponses(stderr) {
  return [
    ...stderr.matchAll(
      /^TSUMUCODE_FORM_RESPONSE:([1-8]):(request-start|upstream-end|downstream-finished|closed-before-finish|browser-response|browser-finished|browser-aborted|browser-failed):(\d{1,6})\n/gmu,
    ),
  ]
    .slice(-24)
    .map((match) => ({
      request: Number(match[1]),
      event: match[2],
      elapsedMs: Number(match[3]),
    }));
}

/** CDPから得た有限な受信量だけを採用し、URL・本文・未知分類を出さない。 */
function formReceipts(stderr) {
  return [
    ...stderr.matchAll(
      /^TSUMUCODE_FORM_RECEIPT:([1-8]):([1-8]|unknown):([1-5]\d{2}|unknown):(\d{1,6}|unknown):(\d{1,6}):(finished|aborted|failed|open):(plain|encoded|unknown)\n/gmu,
    ),
  ]
    .filter(
      (match) =>
        (match[4] === 'unknown' || Number(match[4]) <= 512 * 1024) &&
        Number(match[5]) <= 512 * 1024 + 1,
    )
    .slice(-8)
    .map((match) => ({
      request: Number(match[1]),
      bridgeRequest: match[2] === 'unknown' ? 'unknown' : Number(match[2]),
      status: match[3] === 'unknown' ? 'unknown' : Number(match[3]),
      expectedBytes: match[4] === 'unknown' ? 'unknown' : Number(match[4]),
      receivedBytes: Number(match[5]),
      state: match[6],
      encoding: match[7],
    }));
}

/** API入力からimage/command/権限を選ばず、固定Browserだけで現在runを観測する。 */
export async function gradeProject({ owner, image, source, runId, socket, signal }) {
  if (!image || !/^tsumucode-learning-[a-z0-9-]+-grader:local$/u.test(image))
    throw new Error('Grader image is not configured');
  const started = Date.now();
  const name = `${owner}-grade-${randomUUID()}`;
  const metadata = projectMetadata(source, runId);
  let id;
  let enginePhase = 'image-inspect';
  let attempted = false;
  let stopping;
  let aborted = signal?.aborted;
  let cancelledError = new Error('Grade cancelled');
  let rejectCancelled;
  const cancellation = new Promise((resolve, reject) => {
    rejectCancelled = reject;
  });
  // create/inspect中に中断しても、その応答を待って実体を回収する。
  const cancel = (deadline = false) => {
    aborted = true;
    rejectCancelled(cancelledError);
    if (deadline && !id)
      console.error(
        'Next grade deadline',
        JSON.stringify({ enginePhase, phase: 'unknown', elapsedMs: null }),
      );
    if (id)
      stopping = (async () => {
        try {
          if (deadline) {
            const output = await docker(
              'GET',
              `/containers/${id}/logs?stdout=0&stderr=1&tail=20`,
              undefined,
              200,
              true,
            );
            const { stderr } = gradeOutput(output, 16 * 1024);
            const last = gradeProgress(stderr).at(-1);
            const responses = formResponses(stderr);
            const receipts = formReceipts(stderr);
            console.error(
              'Next grade deadline',
              JSON.stringify({
                enginePhase,
                phase: last?.phase ?? 'unknown',
                elapsedMs: last?.elapsedMs ?? null,
                ...(responses.length ? { responses } : {}),
                ...(receipts.length ? { receipts } : {}),
              }),
            );
          }
        } catch {
          if (deadline)
            console.error(
              'Next grade deadline',
              JSON.stringify({ enginePhase, phase: 'unknown', elapsedMs: null }),
            );
        } finally {
          await removeContainer(id).catch(() => {});
        }
      })();
  };
  cancellation.catch(() => {});
  const timer = setTimeout(() => {
    cancelledError = new RequestError(
      503,
      '採点の全体期限10秒を超えました。実行を開始し直して判定してください。',
    );
    cancel(true);
  }, 10000);
  const disconnected = () => cancel();
  signal?.addEventListener('abort', disconnected, { once: true });
  const active = () => {
    if (aborted) throw cancelledError;
  };
  try {
    const inspected = await docker('GET', `/images/${encodeURIComponent(image)}/json`);
    active();
    const config = containerConfig({}, owner);
    config.Image = inspected.Id;
    config.WorkingDir = '/workspace';
    config.Env = [
      'PATH=/usr/local/bin:/usr/bin:/bin',
      'HOME=/tmp',
      'LANG=C.UTF-8',
      'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
    ];
    config.Cmd = [
      '/workspace/scripts/local/project-grade-bootstrap.mjs',
      Buffer.from(JSON.stringify({ metadata, socket })).toString('base64'),
    ];
    config.Labels = {
      ...config.Labels,
      'app.tsumucode.run': runId,
      'app.tsumucode.kind': 'grader',
    };
    config.HostConfig.Memory = 768 * 1024 * 1024;
    config.HostConfig.MemorySwap = config.HostConfig.Memory;
    config.HostConfig.PidsLimit = 128;
    config.HostConfig.Tmpfs = { '/tmp': 'rw,nosuid,nodev,size=256m,uid=1000,gid=1000,mode=0700' };
    config.HostConfig.Mounts = [
      {
        Type: 'volume',
        Source: `${owner}_transport`,
        Target: '/transport',
        ReadOnly: true,
        VolumeOptions: { NoCopy: true, Subpath: runId },
      },
    ];
    enginePhase = 'container-create';
    attempted = true;
    const created = await docker('POST', `/containers/create?name=${name}`, config);
    id = created.Id;
    active();
    enginePhase = 'container-start';
    await docker('POST', `/containers/${id}/start`);
    active();
    enginePhase = 'container-wait';
    const ended = await Promise.race([
      docker('POST', `/containers/${id}/wait`, undefined, 10000),
      cancellation,
    ]);
    active();
    if (ended.StatusCode !== 0) {
      const diagnostic = await docker(
        'GET',
        `/containers/${id}/logs?stdout=0&stderr=1&tail=20`,
        undefined,
        2000,
        true,
      );
      active();
      // Dockerの診断から固定checker自身の段階だけを採用する。
      const { stderr } = gradeOutput(diagnostic, 16 * 1024);
      const phase = stderr.match(
        /^TSUMUCODE_GRADE_PHASE:(marker-before|form-reserve|browser-launch|initial-navigation|initial-idle|observations|project-structure|project-filter|project-presentation|form-invalid|form-first-send|form-retry|form-inspect|form-response-headers|form-response-body|form-response-dom|form-reset-before|form-reset-after|form-document-unchanged|form-document-changed|marker-after|browser-close|form-release)\n/mu,
      )?.[1];
      const reason = stderr.match(
        /^TSUMUCODE_GRADE_FAILURE:(form-busy|http-deadline|http-connection|document-context|browser-closed|dom-contract|identity|unknown)\n/mu,
      )?.[1];
      if (
        phase === 'form-reserve' &&
        reason === 'form-busy' &&
        ['next-ch04-l01-e01', 'next-ch04-l02-e01'].includes(source.workspaceId)
      )
        throw new RequestError(
          409,
          'Preview送信中または採点予約中です。送信完了後にもう一度判定してください。',
        );
      throw new RequestError(
        503,
        `採点用Browserが終了しました（段階: ${phase ?? '未確認'} / 分類: ${reason ?? '未確認'}）。`,
      );
    }
    enginePhase = 'result-read';
    const output = await docker(
      'GET',
      `/containers/${id}/logs?stdout=1&stderr=1`,
      undefined,
      2000,
      true,
    );
    active();
    const { stdout, stderr } = gradeOutput(output);
    const progress = gradeProgress(stderr);
    const responses = formResponses(stderr);
    const receipts = formReceipts(stderr);
    const result = JSON.parse(stdout);
    for (const [key, value] of Object.entries(metadata))
      if (result[key] !== value) throw new Error('Grade identity mismatch');
    if (
      !['pass', 'incomplete', 'code-error'].includes(result.status) ||
      typeof result.actual !== 'string' ||
      result.actual.length > 512 ||
      !Array.isArray(result.diagnostics) ||
      result.diagnostics.length > 8
    )
      throw new Error('Invalid grade result');
    const goals = nextWorkspace(source.workspaceId)?.ruleGoals;
    if (goals) {
      const checks = result.projectChecks;
      if (
        !Array.isArray(checks) ||
        checks.length !== goals.length ||
        checks.some(
          (check, index) =>
            !check ||
            check.goal !== goals[index] ||
            typeof check.passed !== 'boolean' ||
            typeof check.actual !== 'string' ||
            check.actual.length > 160,
        ) ||
        (result.status === 'pass') !==
          (!result.diagnostics.length && checks.every((check) => check.passed)) ||
        (result.status === 'code-error' && checks.some((check) => check.passed))
      )
        throw new Error('Invalid project grade checks');
    }
    const engineElapsedMs = Date.now() - started;
    if (engineElapsedMs >= 8000)
      console.error(
        'Next grade slow',
        JSON.stringify({
          engineElapsedMs,
          progress,
          ...(responses.length ? { responses } : {}),
          ...(receipts.length ? { receipts } : {}),
        }),
      );
    else if (['next-ch04-l01-e01', 'next-ch04-l02-e01'].includes(source.workspaceId))
      // 再起動後の期限調査用。Sourceや入力を出さず、固定段階と時間だけを残す。
      console.error(
        'Next grade timing',
        JSON.stringify({
          engineElapsedMs,
          progress,
          ...(responses.length ? { responses } : {}),
          ...(receipts.length ? { receipts } : {}),
        }),
      );
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', disconnected);
    await stopping;
    if (attempted) await removeContainer(id ?? name);
  }
}
