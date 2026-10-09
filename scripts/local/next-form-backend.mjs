import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readPreviewBody } from './preview-body.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const validInput = (input) =>
  typeof input === 'string' && input === input.trim() && input.length >= 3 && input.length <= 40;

/** 同じrun・保存版の練習用履歴。採点の予約とPreviewの32件を別々に保持する。 */
export function nextFormBackend(base, metadata) {
  const preview = new Map();
  let lease;
  let retired = false;
  let publicRequests = 0;
  const currentLease = () => {
    if (lease && Date.now() >= lease.expires) lease = undefined;
    return lease;
  };
  const reply = (res, status, value) => {
    if (retired || res.destroyed || res.writableEnded) {
      res.destroy();
      return;
    }
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
  };
  const state = (status, message, input, count = 0) => ({ status, message, input, count });
  const controls = new Set(['op', 'leaseId', 'memo', 'runId', 'sourceRevision', 'sourceHash']);

  return {
    /** 公開送信には予約IDを持たせない。採点IDは検査後、Server helperだけへ伝える。 */
    authorizePost(req, res) {
      const reserved = currentLease();
      const supplied = req.headers['x-tsumucode-note-lease'];
      delete req.headers['x-tsumucode-note-lease'];
      if ((reserved && supplied !== reserved.id) || (!reserved && supplied !== undefined)) {
        reply(res, 409, { error: 'Form grading reservation mismatch' });
        return false;
      }
      if (reserved) req.headers['x-tsumucode-note-lease'] = reserved.id;
      else {
        publicRequests++;
        let completed = false;
        const finish = () => {
          if (completed) return;
          completed = true;
          publicRequests--;
        };
        res.once('finish', finish);
        res.once('close', finish);
      }
      return true;
    },
    /** 非公開controlと同一隔離のstoreだけを扱う。管理資格情報は使わない。 */
    handle(req, res) {
      const url = new URL(req.url, 'http://127.0.0.1:5174');
      if (url.pathname === '/__tsumucode_note' && req.method === 'GET') {
        const parameters = url.searchParams;
        const keys = [...parameters.keys()];
        const id = parameters.get('leaseId');
        const matches =
          keys.every((key) => controls.has(key)) &&
          new Set(keys).size === keys.length &&
          uuid.test(id ?? '') &&
          parameters.get('runId') === metadata.runId &&
          parameters.get('sourceRevision') === String(metadata.sourceRevision) &&
          parameters.get('sourceHash') === metadata.sourceHash;
        if (!matches) {
          reply(res, 409, { error: 'Form reservation identity mismatch' });
          return true;
        }
        const op = parameters.get('op');
        const reserved = currentLease();
        if (op === 'reserve' && keys.length === 6) {
          const memo = parameters.get('memo');
          if (reserved || publicRequests > 0 || !validInput(memo)) {
            reply(res, 409, { error: 'Form reservation unavailable' });
          } else {
            lease = {
              id,
              memo,
              expires: Date.now() + 15000,
              attempts: 0,
              saved: 0,
              invalidCalls: 0,
            };
            reply(res, 200, { reserved: true });
          }
          return true;
        }
        if (keys.length !== 5 || !reserved || reserved.id !== id) {
          reply(res, 409, { error: 'Form reservation mismatch' });
          return true;
        }
        if (op === 'inspect') {
          reply(res, 200, {
            attempts: reserved.attempts,
            saved: reserved.saved,
            invalidCalls: reserved.invalidCalls,
            previewEntries: preview.size,
          });
        } else if (op === 'release') {
          lease = undefined;
          reply(res, 200, { released: true });
        } else reply(res, 404, { error: 'Unknown form control' });
        return true;
      }
      if (url.pathname !== `${base}/api/note-store` || url.search || req.method !== 'POST')
        return false;
      // 要求開始時の一致だけで帰属を決める。切断した旧Previewの遅延処理は採点枠に入れない。
      const reserved = currentLease();
      const supplied = req.headers['x-tsumucode-note-lease'];
      const grading = supplied !== undefined && reserved?.id === supplied ? reserved : undefined;
      void (async () => {
        if (supplied !== undefined && !grading) {
          reply(res, 409, { error: 'Retired form reservation' });
          return;
        }
        const body = await readPreviewBody(req, { limit: 64 * 1024, timeoutMs: 30000 });
        let input;
        try {
          const value = JSON.parse(body.toString());
          if (Object.keys(value).length === 1) input = value.input;
        } catch {
          input = undefined;
        }
        if (!validInput(input)) {
          if (grading) grading.invalidCalls++;
          reply(res, 400, state('invalid', 'Serverで入力を検証してください。', input ?? ''));
          return;
        }
        if (grading && input !== grading.memo) {
          grading.invalidCalls++;
          reply(res, 400, state('invalid', '採点対象の入力が一致しません。', input));
          return;
        }
        let entry = grading ?? preview.get(input);
        if (!entry) {
          if (preview.size >= 32) {
            reply(
              res,
              503,
              state('failed', '練習用履歴の上限です。Sourceを反映し直してください。', input),
            );
            return;
          }
          entry = { attempts: 0, saved: 0 };
          preview.set(input, entry);
        }
        const attempt = ++entry.attempts;
        await delay(350);
        if (grading && currentLease() !== grading) {
          res.destroy();
          return;
        }
        if (attempt === 1)
          reply(
            res,
            503,
            state('failed', '一時的に保存できませんでした。同じ内容で再試行してください。', input),
          );
        else {
          entry.saved++;
          reply(res, 200, state('saved', '保存できました。', input, entry.saved));
        }
      })().catch(() => reply(res, 400, { error: 'Invalid form store request' }));
      return true;
    },
    /** 新保存版の履歴へ、旧処理の結果を渡さない。 */
    retire() {
      retired = true;
      lease = undefined;
    },
  };
}
