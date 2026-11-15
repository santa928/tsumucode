import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// This will be updated to the exact observational spec hash after the hook is inserted.
const specHash = '482cd0e6ddcd50022b81fadf8b4df3d644e60454fb4b5f28673d86746be45e37';
const networkKeys = ['session', 'capabilities', 'run', 'poll'];
const networkValues = new Set(['none', 'pending', 'network-failed', '2xx', '3xx', '4xx', '5xx', 'other', 'mixed']);
const versions = new Set(['expected', 'unversioned', 'other', 'absent', 'unknown']);
const results = new Set(['succeeded', 'type-error', 'unsupported', 'stopped', 'system-error', 'code-error', 'other', 'absent', 'unknown']);
const flags = new Set(['yes', 'no', 'unknown']);
const flag = x => x === true ? 'yes' : x === false ? 'no' : 'unknown';

export function safeUi(ui) {
  return {
    version: versions.has(ui?.version) ? ui.version : 'unknown',
    result: results.has(ui?.result) ? ui.result : 'unknown',
    line8: flag(ui?.line8), lineEnd: flag(ui?.lineEnd), alert: flag(ui?.alert),
  };
}

function route(method, rawUrl) {
  if (method !== 'POST') return undefined;
  try {
    const u = new URL(rawUrl);
    if (u.origin !== 'http://127.0.0.1:4173') return undefined;
    if (u.pathname === '/api/session') return 'session';
    if (u.pathname === '/api/python-capabilities') return 'capabilities';
    if (u.pathname === '/api/runs') return 'run';
    if (/^\/api\/runs\/[^/]+$/u.test(u.pathname)) return 'poll';
  } catch { /* Do not expose malformed URL or exception details. */ }
  return undefined;
}
function statusClass(code) {
  return Number.isInteger(code) && code >= 200 && code <= 599 ? `${Math.floor(code / 100)}xx` : 'other';
}
export function createPreviewTracker() {
  const slots = Object.fromEntries(networkKeys.map(key => [key, { sent:false, failed:false, codes:new Set() }]));
  const get = request => { try { return slots[route(request.method(), request.url())]; } catch { return undefined; } };
  return {
    request(request) { const slot=get(request); if (slot) slot.sent=true; },
    failed(request) { const slot=get(request); if (slot) { slot.sent=true; slot.failed=true; } },
    response(response) { try { const slot=get(response.request()); if (slot) { slot.sent=true; slot.codes.add(statusClass(response.status())); } } catch { /* Observe only. */ } },
    snapshot(ui) {
      const network = Object.fromEntries(networkKeys.map(key => {
        const {sent,failed,codes}=slots[key];
        const value=!sent ? 'none' : (codes.size>1 || (failed && codes.size>0)) ? 'mixed' : failed ? 'network-failed' : codes.size===0 ? 'pending' : [...codes][0];
        return [key,value];
      }));
      return { network, ui:safeUi(ui) };
    },
  };
}

export function previewLines(value, actualHash) {
  if (actualHash !== specHash) return ['preview-diagnostic spec-mismatch'];
  if (!value || typeof value !== 'object' || !value.network || !value.ui ||
      !networkKeys.every(k => networkValues.has(value.network[k])) ||
      !versions.has(value.ui.version) || !results.has(value.ui.result) ||
      !['line8','lineEnd','alert'].every(k => flags.has(value.ui[k]))) return ['preview-diagnostic invalid'];
  return [
    `preview network-session=${value.network.session} capabilities=${value.network.capabilities} run=${value.network.run} poll=${value.network.poll}`,
    `preview ui-version=${value.ui.version} result=${value.ui.result} line8=${value.ui.line8} line-end=${value.ui.lineEnd} alert=${value.ui.alert}`,
  ];
}

// Only invoked after an existing preview assertion fails. Browser data is reduced to fixed categories before leaving the page.
export async function capturePreviewFailure(page, tracker) {
  let timer;
  let ui;
  try {
    ui = await Promise.race([
      page.evaluate(() => {
        const env = document.querySelector('p[aria-label="実行環境"]')?.textContent?.trim();
        const text = document.querySelector('aside[aria-label="工程票"] header p[role="status"]')?.textContent?.trim();
        const status = new Map([
          ['実行できました（合否は「判定する」で確認）', 'succeeded'],
          ['型を確認してください。まだ実行・採点していません。', 'type-error'],
          ['この環境では未対応です。採点していません。', 'unsupported'],
          ['実行を停止しました。採点していません。', 'stopped'],
          ['実行環境で問題が起きました。採点していません。', 'system-error'],
          ['コードのエラーを確認してください。', 'code-error'],
        ]);
        const lines = [...document.querySelectorAll('section[aria-label="Console出力"] code')];
        return {
          version: env === undefined ? 'absent' : env === 'ローカル CPython 3.14.2で実行' ? 'expected' : env === 'ローカル CPythonで実行' ? 'unversioned' : 'other',
          result: text === undefined ? 'absent' : status.get(text) ?? 'other',
          line8: lines.some(node => node.textContent === '8'),
          lineEnd: lines.some(node => node.textContent === '終了'),
          alert: document.querySelector('[role="alert"]') !== null,
        };
      }).catch(() => undefined),
      new Promise(resolve => { timer = setTimeout(() => resolve(undefined), 1000); }),
    ]);
  } catch { /* Ignore observation errors and keep the original failure. */ }
  finally { clearTimeout(timer); }
  return tracker.snapshot(ui);
}

async function main() {
  let file;
  try {
    if (process.argv.length !== 3) throw Error();
    file = await open(process.argv[2], constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 4096) throw Error();
    const body = await file.readFile('utf8');
    const sha = createHash('sha256').update(await readFile(new URL('./local-import.spec.ts', import.meta.url))).digest('hex');
    for (const line of previewLines(JSON.parse(body), sha)) console.log(line);
  } catch { console.log('preview-diagnostic unavailable'); }
  finally { await file?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => console.log('preview-diagnostic unavailable'));
}
