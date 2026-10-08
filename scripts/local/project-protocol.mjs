import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { RequestError, LIMITS } from './protocol.mjs';
import { NEXT_PROFILE, NEXT_WORKSPACE, nextWorkspace } from './next-project-protocol.mjs';

export const PROJECT_PROFILE = 'vite-project-v1';
export const PROJECT_LIMITS = Object.freeze({
  sourceBytes: LIMITS.sourceBytes,
  workspaces: 16,
  startMs: 20000,
  probeMs: 2000,
  idleMs: 10 * 60 * 1000,
  lifetimeMs: 60 * 60 * 1000,
});
export const STARTER_FILES = Object.freeze({
  'index.html': `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Workspace</title>
  </head>
  <body>
    <main><h1 id="message"></h1></main>
    <script type="module" src="/main.js"></script>
  </body>
</html>
`,
  'main.js': `import { message } from './message.js';
import './styles.css';

document.querySelector('#message').textContent = message;
`,
  'message.js': `export const message = 'こんにちは、Workspace！';
`,
  'styles.css': `body {
  font-family: sans-serif;
  margin: 2rem;
}
`,
});

/** 未知の設定やファイルを拒否し、API入力がDocker設定へ流れ込むのを防ぐ。 */
export function exact(input, keys) {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== 'object' ||
    Object.keys(input).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(input, key))
  )
    throw new RequestError(400, '要求の項目が不正です。');
  return input;
}

export function workspaceId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/u.test(id))
    throw new RequestError(400, 'Workspace IDが不正です。');
  return id;
}

export function expectedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RequestError(400, 'Source版が不正です。');
  return value;
}

export function runId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{1,80}$/u.test(value))
    throw new RequestError(400, '実行IDが不正です。');
  return value;
}

export function starterFiles(profile = PROJECT_PROFILE, id = NEXT_WORKSPACE) {
  if (profile === PROJECT_PROFILE) return STARTER_FILES;
  if (profile === NEXT_PROFILE && nextWorkspace(id)) return nextWorkspace(id).files;
  throw new RequestError(400, '未対応のProject profileです。');
}

export function validateFiles(files, profile = PROJECT_PROFILE, id = NEXT_WORKSPACE) {
  exact(files, Object.keys(starterFiles(profile, id)));
  let size = 0;
  for (const value of Object.values(files)) {
    if (typeof value !== 'string') throw new RequestError(400, 'Sourceは文字列が必要です。');
    size += Buffer.byteLength(value);
  }
  if (size > PROJECT_LIMITS.sourceBytes) throw new RequestError(413, 'Sourceが大きすぎます。');
  return { ...files };
}

/** file順序に依存せず、起動時Sourceと保存済みSourceを照合できるhashを返す。 */
export function projectHash(files, profile = PROJECT_PROFILE, id = NEXT_WORKSPACE) {
  return createHash('sha256')
    .update(
      JSON.stringify(Object.keys(starterFiles(profile, id)).map((name) => [name, files[name]])),
    )
    .digest('hex');
}
