import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { TextDecoder } from 'node:util';
import { pathToFileURL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import process from 'node:process';
import console from 'node:console';

const { AbortController } = globalThis;

const endpoints = [
  'https://api.github.com/repos/santa928/tsumucode/deployments?environment=github-pages&per_page=1',
  'https://api.github.com/repos/santa928/tsumucode/deployments/7699435659/statuses',
];
const maxBytes = 1024 * 1024;
const deadlineMs = 15_000;

function rateClass(response) {
  const remaining = response.headers.get('x-ratelimit-remaining');
  if (remaining === null || !/^\d{1,20}$/u.test(remaining)) return 'unknown';
  return BigInt(remaining) === 0n ? 'zero' : 'positive';
}
function matches(index, value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  const item = value[0];
  if (index === 0) {
    return (
      item?.id === 7699435659 &&
      item?.sha === 'b9306eb3414e69a2068603cfdbf2706ebe4e9284' &&
      item?.ref === 'main' &&
      item?.environment === 'github-pages'
    );
  }
  return (
    item?.state === 'success' &&
    item.environment_url === 'https://santa928.github.io/tsumucode/' &&
    item.log_url ===
      'https://github.com/santa928/tsumucode/actions/runs/42929117936/job/130265372396'
  );
}
async function boundedBody(response, start, timeoutMs) {
  if (!response.body) throw Error('missing body');
  const buffer = Buffer.alloc(maxBytes);
  let bytes = 0;
  for await (const chunk of response.body) {
    if (performance.now() - start >= timeoutMs) throw Error('deadline');
    if (!(chunk instanceof Uint8Array) || bytes + chunk.byteLength > maxBytes)
      throw Error('body too large');
    buffer.set(chunk, bytes);
    bytes += chunk.byteLength;
  }
  if (performance.now() - start >= timeoutMs) throw Error('deadline');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes)));
}
async function one(index, request, timeoutMs) {
  const controller = new AbortController();
  const start = performance.now();
  let timer;
  try {
    const operation = (async () => {
      const response = await request(endpoints[index], {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'tsumucode-anonymous-probe',
        },
        redirect: 'error',
        signal: controller.signal,
      });
      const http = [200, 403, 429].includes(response.status) ? String(response.status) : 'other';
      const rate = rateClass(response);
      if (http !== '200') return { http, rate, fixed: 'not-checked' };
      let value;
      try {
        value = await boundedBody(response, start, timeoutMs);
      } catch {
        return { http, rate, fixed: 'invalid' };
      }
      if (performance.now() - start >= timeoutMs) throw Error('deadline');
      return { http, rate, fixed: matches(index, value) ? 'match' : 'mismatch' };
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Error('deadline'));
      }, timeoutMs);
    });
    const result = await Promise.race([operation, timeout]);
    if (performance.now() - start >= timeoutMs) throw Error('deadline');
    return result;
  } catch {
    return { http: 'unavailable', rate: 'unknown', fixed: 'not-checked' };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
export async function probe(request, emit, timeoutMs = deadlineMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > deadlineMs) return false;
  for (const [index, label] of ['deployment', 'status'].entries()) {
    const result = await one(index, request, timeoutMs);
    emit(`${label} http=${result.http} rate=${result.rate} fixed=${result.fixed}`);
    if (result.http !== '200' || result.fixed !== 'match') return false;
  }
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ok = await probe(globalThis.fetch, (line) => console.log(line));
  if (!ok) process.exitCode = 1;
}
