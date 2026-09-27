import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

export const API_VERSION = 1;
export const EXERCISE_ID = 'javascript-ch03-l05-e01';
export const EXERCISE_IDS = Object.freeze([
  EXERCISE_ID,
  'javascript-ch03-l05-e02',
  'javascript-ch03-l05-e03',
]);
export const PROFILE_ID = 'node-closure-v1';
export const NODE_IMAGE =
  'node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5';
export const LIMITS = Object.freeze({
  concurrency: 1,
  cpu: 1,
  memoryBytes: 256 * 1024 * 1024,
  pids: 64,
  wallMs: 5000,
  outputBytes: 64 * 1024,
  sourceBytes: 100 * 1024,
});
export const ORIGIN = 'http://127.0.0.1:4173';

/** 型・余剰キー・資源指定を入口で拒否するHTTPエラー。 */
export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** JSON objectだけを受け入れ、未知の実行設定を拒否する。 */
function exactObject(value, keys) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new RequestError(400, '要求の形式が一致しません。');
}

/** 固定教材の正規化済みファイルを検査する。パスを修復して受け入れない。 */
export function validateRun(value, revision) {
  exactObject(value, [
    'apiVersion',
    'exerciseId',
    'contentRevision',
    'runtimeProfileId',
    'runId',
    'exerciseSessionId',
    'executionRevision',
    'files',
  ]);
  if (value.apiVersion !== API_VERSION || value.contentRevision !== revision)
    throw new RequestError(
      409,
      '教材またはAPIの版が異なります。コードを保存して再読み込みしてください。',
    );
  if (!EXERCISE_IDS.includes(value.exerciseId) || value.runtimeProfileId !== PROFILE_ID)
    throw new RequestError(422, 'この環境では未対応の演習です。');
  for (const key of ['runId', 'exerciseSessionId']) {
    if (typeof value[key] !== 'string' || !/^[\w:.-]{1,160}$/u.test(value[key]))
      throw new RequestError(400, '実行IDが不正です。');
  }
  if (!Number.isSafeInteger(value.executionRevision) || value.executionRevision < 0)
    throw new RequestError(400, '編集版が不正です。');
  exactObject(value.files, ['script.js', 'index.html', 'styles.css']);
  let size = 0;
  for (const content of Object.values(value.files)) {
    if (typeof content !== 'string')
      throw new RequestError(400, 'ファイルは文字列で指定してください。');
    size += Buffer.byteLength(content);
  }
  if (size > LIMITS.sourceBytes)
    throw new RequestError(413, 'ファイル合計を100 KiB以内にしてください。');
  return value;
}

/** Proxy越しでも元のHost/Originと起動session tokenを検査する。 */
export function authorize(headers, token, bootstrap = false) {
  if (headers.host !== new URL(ORIGIN).host) throw new RequestError(403, 'Hostが一致しません。');
  if (headers.origin !== ORIGIN) throw new RequestError(403, 'Originが一致しません。');
  if (headers['sec-fetch-site'] && headers['sec-fetch-site'] !== 'same-origin')
    throw new RequestError(403, '同じ画面から実行してください。');
  if (bootstrap) return;
  const actual = Buffer.from(headers['x-tsumucode-token'] ?? '');
  const expected = Buffer.from(token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new RequestError(401, '接続が更新されました。もう一度実行してください。');
}

/** 送信したsourceそのものの照合値。学習者の出力からは取得しない。 */
export function sourceHash(source) {
  return createHash('sha256').update(source).digest('hex');
}
