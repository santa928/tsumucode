import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { performance } from 'node:perf_hooks';
const { AbortController } = globalThis;

const root = 'https://santa928.github.io/tsumucode/';
const api = 'https://api.github.com/repos/santa928/tsumucode';
const source = 'b9306eb3414e69a2068603cfdbf2706ebe4e9284';
const repo = 'santa928/tsumucode';
const apiPaths = Object.freeze([
  '/pulls/356',
  '/git/ref/heads/main',
  '/deployments?environment=github-pages&per_page=1',
  '/deployments/7699435659/statuses',
]);
const files = Object.freeze({
  'index.html': '916497abcb399f2624553292e8ac4d1be2a546452d5a144f190dba5f64ae4e18',
  'generated/content/catalog-v3.json':
    'cda11e589e968948b8e94a0265eaed7a048f28ffb140467648084ed240a48491',
  'generated/content/courses/python-basics/index.json':
    '380b46f8bffe0aeebeb19394f0ef2b5c1c23e86004d6965241ed2f6157295698',
});
export const MAX_RESPONSE = 8 * 1024 * 1024;
const sha40 = (x) => typeof x === 'string' && /^[a-f0-9]{40}$/u.test(x);
const number = (x) => typeof x === 'string' && /^[1-9][0-9]{0,19}$/u.test(x);
export function validContext(c) {
  return (
    c?.event === 'workflow_dispatch' &&
    c.ref === 'refs/heads/main' &&
    c.repo === repo &&
    c.actor === 'santa928' &&
    sha40(c.workflowSha) &&
    c.workflowSha === c.runSha &&
    sha40(c.candidateSha) &&
    number(c.runId) &&
    number(c.attempt)
  );
}
// A separate deadline rejects even if request/stream ignores AbortSignal. Late
// rejections are observed and iterator cancellation is deliberately not awaited.
export function withDeadline(operation, timeoutMs, cancel = () => {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        cancel();
      } catch {
        /* Fixed failure; never reveal cancellation error. */
      }
      reject(Error('deadline'));
    }, timeoutMs);
    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(Error('unavailable'));
        },
      );
  });
}
function closeIterator(iterator) {
  try {
    if (iterator?.return) Promise.resolve(iterator.return()).catch(() => {});
  } catch {
    /* Never wait for or expose cancellation. */
  }
}
export async function readBounded(request, url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const deadlineAt = performance.now() + timeoutMs;
  let iterator,
    complete = false;
  const cancel = () => {
    controller.abort();
    closeIterator(iterator);
  };
  try {
    return await withDeadline(
      async () => {
        const response = await request(url, { ...options, signal: controller.signal });
        if (!response.ok || !response.body || !response.body[Symbol.asyncIterator]) throw Error();
        iterator = response.body[Symbol.asyncIterator]();
        if (controller.signal.aborted || performance.now() >= deadlineAt) {
          cancel();
          throw Error();
        }
        let size = 0;
        const chunks = [];
        for (;;) {
          if (performance.now() >= deadlineAt) {
            cancel();
            throw Error();
          }
          const item = await iterator.next();
          if (controller.signal.aborted || performance.now() >= deadlineAt) {
            cancel();
            throw Error();
          }
          if (item.done) {
            complete = true;
            break;
          }
          if (!(item.value instanceof Uint8Array) || item.value.length === 0) throw Error();
          size += item.value.length;
          if (size > MAX_RESPONSE) throw Error();
          chunks.push(item.value);
        }
        const data = Buffer.concat(chunks);
        if (controller.signal.aborted || performance.now() >= deadlineAt) {
          cancel();
          throw Error();
        }
        return data;
      },
      timeoutMs,
      cancel,
    );
  } finally {
    if (!complete) {
      controller.abort();
      closeIterator(iterator);
    }
  }
}

export async function verifyIdentity({ context, token, request }) {
  try {
    if (
      !validContext(context) ||
      typeof token !== 'string' ||
      !token ||
      token.length > 4096 ||
      /[\r\n]/u.test(token) ||
      typeof request !== 'function'
    )
      throw Error();
    const readApi = async (path) => {
      if (!apiPaths.includes(path)) throw Error();
      const data = await readBounded(request, api + path, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
        redirect: 'error',
        cache: 'no-store',
      });
      return JSON.parse(data.toString('utf8'));
    };
    const pr = await readApi('/pulls/356');
    if (
      pr.number !== 356 ||
      pr.state !== 'open' ||
      pr.draft !== true ||
      pr.head?.repo?.full_name !== repo ||
      pr.head?.ref !== 'codex/issue143-hosted-draft' ||
      pr.head?.sha !== context.candidateSha ||
      pr.base?.repo?.full_name !== repo ||
      pr.base?.ref !== 'main' ||
      pr.base?.sha !== context.workflowSha
    )
      throw Error();
    const main = await readApi('/git/ref/heads/main');
    if (main.ref !== 'refs/heads/main' || main.object?.sha !== context.workflowSha) throw Error();
    const d = (await readApi('/deployments?environment=github-pages&per_page=1'))[0];
    if (
      String(d?.id) !== '7699435659' ||
      d.sha !== source ||
      d.ref !== 'main' ||
      d.environment !== 'github-pages'
    )
      throw Error();
    const status = (await readApi('/deployments/7699435659/statuses'))[0];
    if (
      status?.state !== 'success' ||
      status.environment_url !== root ||
      !status.log_url?.startsWith(
        'https://github.com/santa928/tsumucode/actions/runs/42929117936/job/',
      )
    )
      throw Error();
    for (const [name, hash] of Object.entries(files)) {
      const data = await readBounded(request, root + name, {
        redirect: 'error',
        cache: 'no-store',
      });
      if (createHash('sha256').update(data).digest('hex') !== hash) throw Error();
    }
    return true;
  } catch {
    return false;
  }
}
export function binding(context) {
  if (!validContext(context)) return undefined;
  return Object.freeze({
    runId: context.runId,
    attempt: context.attempt,
    head: context.candidateSha,
    base: context.workflowSha,
    source,
  });
}
export function admit(context, jobs, fresh) {
  if (!validContext(context) || fresh !== true || !jobs || typeof jobs !== 'object') return false;
  const expected = binding(context);
  return ['pre', 'observation', 'post'].every((name) => {
    const job = jobs[name];
    return (
      job?.result === 'success' &&
      job.binding &&
      Object.keys(job.binding).length === Object.keys(expected).length &&
      Object.keys(expected).every((key) => job.binding[key] === expected[key])
    );
  });
}
