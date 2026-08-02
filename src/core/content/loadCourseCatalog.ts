/** 公開教材JSONを同一Originから取得し、Runtime境界でSchema検証する。 */
import { resolvePublicAsset } from '../../shared/lib/resolvePublicAsset';
import {
  parseIntegrityVerifiedCourseManifest,
  parseRuntimeCourseCatalog,
} from './runtimeValidation';
import { ContentLoadError, courseContentRepository } from './CourseContentRepository';
import type {
  CourseCatalog,
  CourseCatalogEntry,
  CourseCatalogEntryV3,
  CourseCatalogV3,
  CourseIndex,
  CourseManifest,
  LessonManifest,
} from './types';

export { ContentLoadError, type ContentLoadErrorKind } from './CourseContentRepository';

const CATALOG_PATH = 'generated/content/catalog.json';
/** Public相対PathをBASE_URL配下へ解決し、Path契約違反をSchema失敗へ分類する。 */
function resolveContentResource(baseUrl: string, relativePath: string): string {
  try {
    return resolvePublicAsset(baseUrl, relativePath);
  } catch (error) {
    throw new ContentLoadError('schema', relativePath, error);
  }
}

/** Resourceを取得し、network／HTTP statusの失敗を分類する。 */
async function fetchResource(resource: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(resource, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new ContentLoadError('http', resource, error);
  }

  if (!response.ok) {
    throw new ContentLoadError('http', resource, response.status);
  }

  return response;
}

/** JSON resourceを取得し、JSON parseの失敗を分類する。 */
async function fetchJson(resource: string): Promise<unknown> {
  const response = await fetchResource(resource);

  try {
    return await response.json();
  } catch (error) {
    throw new ContentLoadError('json', resource, error);
  }
}

/** SHA-256をWeb Cryptoで計算し、小文字hexへ変換する。 */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** UTF-8 bytesをJSONへ変換し、decode／parse失敗を同じ分類へ閉じ込める。 */
function parseJsonBytes(bytes: Uint8Array, resource: string): unknown {
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new ContentLoadError('json', resource, error);
  }
}

/** BASE_URL配下のCatalogを取得し、公開Course一覧契約へ変換する。 */
export async function loadCourseCatalog(baseUrl: string): Promise<CourseCatalog> {
  const resource = resolveContentResource(baseUrl, CATALOG_PATH);
  const payload = await fetchJson(resource);
  try {
    return parseRuntimeCourseCatalog(payload);
  } catch (error) {
    throw new ContentLoadError('schema', resource, error);
  }
}

/** Catalogが指すCourse Manifestを同一Originから取得し、integrity付きCourseへ変換する。 */
export async function loadCourseManifest(
  baseUrl: string,
  entry: CourseCatalogEntry,
): Promise<CourseManifest> {
  const resource = resolveContentResource(baseUrl, entry.manifestPath);
  const response = await fetchResource(resource);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let actualSha256: string;
  try {
    actualSha256 = await sha256Hex(buffer);
  } catch (error) {
    throw new ContentLoadError('integrity', resource, error);
  }
  if (actualSha256 !== entry.manifestSha256) {
    throw new ContentLoadError('integrity', resource);
  }
  const payload = parseJsonBytes(bytes, resource);
  try {
    return parseIntegrityVerifiedCourseManifest(payload, entry);
  } catch (error) {
    throw new ContentLoadError('schema', resource, error);
  }
}

/** 新Catalog v3をRepositoryのsingle-flight経路から取得する。 */
export const loadCourseCatalogV3 = (baseUrl: string): Promise<CourseCatalogV3> =>
  courseContentRepository.loadCatalog(baseUrl);

/** Catalog v3 entryのCourse IndexをRepositoryから取得する。 */
export const loadCourseIndex = (
  baseUrl: string,
  entry: CourseCatalogEntryV3,
): Promise<CourseIndex> => courseContentRepository.loadCourseIndex(baseUrl, entry);

/** Course Index内のLesson ManifestをRepositoryから取得する。 */
export const loadLessonManifest = (
  baseUrl: string,
  index: CourseIndex,
  lessonId: string,
): Promise<LessonManifest> => courseContentRepository.loadLesson(baseUrl, index, lessonId);
