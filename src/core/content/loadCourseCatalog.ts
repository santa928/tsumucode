/** 公開教材JSONを同一Originから取得し、Runtime境界でSchema検証する。 */
import { resolvePublicAsset } from '../../shared/lib/resolvePublicAsset';
import { CourseCatalogSchema, CourseManifestSchema } from './schema';
import type { CourseCatalog, CourseManifest } from './types';

const CATALOG_PATH = 'generated/content/catalog.json';
const CONTENT_LOAD_ERROR_MESSAGE =
  '教材を読み込めませんでした。通信を確認して、もう一度お試しください。';

export type ContentLoadErrorKind = 'http' | 'json' | 'schema';

/** 教材取得の失敗段階と対象resourceを、表示文言から分離して保持するError。 */
export class ContentLoadError extends Error {
  readonly kind: ContentLoadErrorKind;
  readonly resource: string;

  /** 失敗分類、解決済みまたは入力resource、調査用causeを保持する。 */
  constructor(kind: ContentLoadErrorKind, resource: string, cause?: unknown) {
    super(
      CONTENT_LOAD_ERROR_MESSAGE,
      cause === undefined
        ? undefined
        : {
            cause,
          },
    );
    this.name = 'ContentLoadError';
    this.kind = kind;
    this.resource = resource;
  }
}

/** Public相対PathをBASE_URL配下へ解決し、Path契約違反をSchema失敗へ分類する。 */
function resolveContentResource(baseUrl: string, relativePath: string): string {
  try {
    return resolvePublicAsset(baseUrl, relativePath);
  } catch (error) {
    throw new ContentLoadError('schema', relativePath, error);
  }
}

/** JSON resourceを取得し、network／HTTP status／JSON parseの失敗を分類する。 */
async function fetchJson(resource: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(resource, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new ContentLoadError('http', resource, error);
  }

  if (!response.ok) {
    throw new ContentLoadError('http', resource, response.status);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ContentLoadError('json', resource, error);
  }
}

/** BASE_URL配下のCatalogを取得し、公開Course一覧契約へ変換する。 */
export async function loadCourseCatalog(baseUrl: string): Promise<CourseCatalog> {
  const resource = resolveContentResource(baseUrl, CATALOG_PATH);
  const payload = await fetchJson(resource);
  const result = CourseCatalogSchema.safeParse(payload);

  if (!result.success) {
    throw new ContentLoadError('schema', resource, result.error);
  }
  return result.data;
}

/** Catalogが指すCourse Manifestを同一Originから取得し、Course契約へ変換する。 */
export async function loadCourseManifest(
  baseUrl: string,
  manifestPath: string,
): Promise<CourseManifest> {
  const resource = resolveContentResource(baseUrl, manifestPath);
  const payload = await fetchJson(resource);
  const result = CourseManifestSchema.safeParse(payload);

  if (!result.success) {
    throw new ContentLoadError('schema', resource, result.error);
  }
  return result.data;
}
