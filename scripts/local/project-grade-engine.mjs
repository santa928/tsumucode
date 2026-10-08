import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { docker, containerConfig, removeContainer } from './docker-engine.mjs';
import { projectMetadata } from './project-engine.mjs';
import { RequestError } from './protocol.mjs';

/** API入力からimage/command/権限を選ばず、固定Browserだけで現在runを観測する。 */
export async function gradeProject({ owner, image, source, runId, socket, signal }) {
  if (!image || !/^tsumucode-learning-[a-z0-9-]+-grader:local$/u.test(image))
    throw new Error('Grader image is not configured');
  const name = `${owner}-grade-${randomUUID()}`;
  const metadata = projectMetadata(source, runId);
  let id;
  let attempted = false;
  let stopping;
  let aborted = signal?.aborted;
  let rejectCancelled;
  const cancellation = new Promise((resolve, reject) => {
    rejectCancelled = reject;
  });
  // create/inspect中に中断しても、その応答を待って実体を回収する。
  const cancel = () => {
    aborted = true;
    rejectCancelled(new Error('Grade cancelled'));
    if (id) stopping = removeContainer(id).catch(() => {});
  };
  cancellation.catch(() => {});
  const timer = setTimeout(cancel, 10000);
  signal?.addEventListener('abort', cancel, { once: true });
  const active = () => {
    if (aborted) throw new Error('Grade cancelled');
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
    attempted = true;
    const created = await docker('POST', `/containers/create?name=${name}`, config);
    id = created.Id;
    active();
    await docker('POST', `/containers/${id}/start`);
    active();
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
      const phase = diagnostic
        .subarray(0, 16 * 1024)
        .toString()
        .match(
          /TSUMUCODE_GRADE_PHASE:(marker-before|browser-launch|initial-navigation|initial-idle|observations|marker-after)\n/u,
        )?.[1];
      throw new RequestError(503, `採点用Browserが終了しました（段階: ${phase ?? '未確認'}）。`);
    }
    const output = await docker(
      'GET',
      `/containers/${id}/logs?stdout=1&stderr=0`,
      undefined,
      2000,
      true,
    );
    active();
    let offset = 0;
    const chunks = [];
    while (offset < output.length) {
      if (output.length - offset < 8) throw new Error('Invalid grade output');
      const length = output.readUInt32BE(offset + 4);
      if (offset + 8 + length > output.length || output.length > 64 * 1024)
        throw new Error('Grade output limit');
      chunks.push(output.subarray(offset + 8, offset + 8 + length));
      offset += 8 + length;
    }
    const result = JSON.parse(Buffer.concat(chunks).toString());
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
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    await stopping;
    if (attempted) await removeContainer(id ?? name);
  }
}
