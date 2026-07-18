/** GitHub Pagesのrepository subpathを先頭・末尾slash付きへ正規化する。 */
export function testBasePath(value = process.env['BASE_PATH']): string {
  const body = (value ?? '/repository-name/').trim().replace(/^\/+|\/+$/gu, '');
  if (body.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error('不正なBASE_PATHです');
  }
  return body.length === 0 ? '/' : `/${body}/`;
}

/** 生成済みdistを配信するPlaywright preview serverの公開URLを返す。 */
export function testServerUrl(port = 4173, basePath = process.env['BASE_PATH']): string {
  return new URL(testBasePath(basePath), `http://127.0.0.1:${String(port)}/`).href;
}
