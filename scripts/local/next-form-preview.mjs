export const FORM_WORKSPACE = 'next-ch04-l01-e01';
export const ACTION_WORKSPACE = 'next-ch04-l02-e01';
export const ACTION_ROOT_TREE = encodeURIComponent(
  JSON.stringify(['', { children: ['__PAGE__', {}, null, null, 4096] }, null, null, 4112]),
);

export function isNextForm(workspaceId) {
  return [FORM_WORKSPACE, ACTION_WORKSPACE].includes(workspaceId);
}

/** 固定2教材のPOST候補だけを認める。内部store/controlは公開しない。 */
export function nextFormPostRoute(raw, target) {
  const root = `/w/${target.workspaceId}/${target.runId}`;
  return (
    (target.workspaceId === FORM_WORKSPACE && raw === `${root}/api/note`) ||
    (target.workspaceId === ACTION_WORKSPACE && [root, `${root}/`].includes(raw))
  );
}

/** 固定版の実ブラウザが送る有限ヘッダーを検査する。Cookie等は転送対象にしない。 */
export function nextFormRequest(req, target) {
  if (!isNextForm(target.workspaceId)) return undefined;
  const headers = req.headers;
  const nextKeys = [
    'next-action',
    'rsc',
    'next-router-state-tree',
    'next-url',
    'next-router-prefetch',
  ];
  if (['GET', 'HEAD'].includes(req.method)) {
    if (nextKeys.some((key) => key in headers)) return undefined;
    // api/noteのGETやcanonical rootのGETを、新しい公開経路にしない。
    const root = `/w/${target.workspaceId}/${target.runId}`;
    if (req.url === `${root}/api/note` || req.url === root) return undefined;
    return { stream: false, headers: {} };
  }
  if (
    req.method !== 'POST' ||
    target.grading === true ||
    !nextFormPostRoute(req.url, target) ||
    headers.origin !== `http://${target.runId}.localhost:4175` ||
    headers.host !== `${target.runId}.localhost:4175` ||
    headers['sec-fetch-site'] !== 'same-origin' ||
    headers['sec-fetch-mode'] !== 'cors' ||
    headers['sec-fetch-dest'] !== 'empty'
  )
    return undefined;
  if (target.workspaceId === FORM_WORKSPACE) {
    if (headers['content-type'] !== 'application/json' || nextKeys.some((key) => key in headers))
      return undefined;
    return { stream: false, headers: {}, post: true };
  }
  if (
    !/^multipart\/form-data; boundary=----WebKitFormBoundary[A-Za-z0-9]{16}$/u.test(
      headers['content-type'] ?? '',
    ) ||
    !/^[a-f0-9]{42}$/u.test(headers['next-action'] ?? '') ||
    headers['next-router-state-tree'] !== ACTION_ROOT_TREE ||
    headers.accept !== 'text/x-component' ||
    ['rsc', 'next-url', 'next-router-prefetch'].some((key) => key in headers)
  )
    return undefined;
  return {
    stream: true,
    post: true,
    headers: {
      'next-action': headers['next-action'],
      'next-router-state-tree': ACTION_ROOT_TREE,
      accept: 'text/x-component',
    },
  };
}
