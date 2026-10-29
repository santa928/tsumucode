/** 分割教材を同一Originからintegrity検証し、同時取得を集約するRepository。 */
import { resolvePublicAsset } from '../../shared/lib/resolvePublicAsset';
import { resolveWorkspaceLessonIds } from './selectors';
import {
  parseIntegrityVerifiedCourseIndex,
  parseIntegrityVerifiedLessonManifest,
  parseRuntimeCourseCatalogV3,
} from './runtimeValidation';
import type { CourseCatalogEntryV3, CourseCatalogV3, CourseIndex, LessonManifest } from './types';

const CATALOG_V3_PATH = 'generated/content/catalog-v3.json';
const CONTENT_LOAD_ERROR_MESSAGE =
  '教材を読み込めませんでした。通信を確認して、もう一度お試しください。';

export type ContentLoadErrorKind = 'http' | 'integrity' | 'json' | 'schema';

/** 教材取得の失敗段階、対象resource、HTTP statusを表示文言から分離する。 */
export class ContentLoadError extends Error {
  readonly kind: ContentLoadErrorKind;
  readonly resource: string;
  readonly status?: number;

  /** 旧cause形式と新status形式を両立し、調査情報をError causeへ保持する。 */
  constructor(
    kind: ContentLoadErrorKind,
    resource: string,
    statusOrCause?: unknown,
    options?: ErrorOptions,
  ) {
    const status = typeof statusOrCause === 'number' ? statusOrCause : undefined;
    const cause = options?.cause ?? statusOrCause;
    super(CONTENT_LOAD_ERROR_MESSAGE, cause === undefined ? options : { ...options, cause });
    this.name = 'ContentLoadError';
    this.kind = kind;
    this.resource = resource;
    if (status !== undefined) this.status = status;
  }
}

export interface CourseContentRepositoryContract {
  loadCatalog(baseUrl: string): Promise<CourseCatalogV3>;
  loadCourseIndex(baseUrl: string, entry: CourseCatalogEntryV3): Promise<CourseIndex>;
  loadLesson(baseUrl: string, index: CourseIndex, lessonId: string): Promise<LessonManifest>;
  loadWorkspaceLessons(
    baseUrl: string,
    index: CourseIndex,
    currentExerciseId: string,
  ): Promise<readonly LessonManifest[]>;
  prefetchLesson(baseUrl: string, index: CourseIndex, lessonId: string): Promise<void>;
}

/** Public相対PathをBASE_URL配下へ解決し、契約違反をschema失敗へ分類する。 */
function resolveContentResource(baseUrl: string, relativePath: string): string {
  try {
    return resolvePublicAsset(baseUrl, relativePath);
  } catch (error) {
    throw new ContentLoadError('schema', relativePath, error);
  }
}

/** Network／HTTP失敗をstatus付きContentLoadErrorへ変換してbytesを返す。 */
async function fetchBytes(resource: string): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(resource, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new ContentLoadError('http', resource, error);
  }
  if (!response.ok) throw new ContentLoadError('http', resource, response.status);
  return response.arrayBuffer();
}

/** SHA-256をWeb Cryptoで計算し、小文字hexへ変換する。 */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** fatal UTF-8 bytesをJSONへ変換し、decode／parse失敗をjsonへ分類する。 */
function parseJsonBytes(bytes: ArrayBuffer, resource: string): unknown {
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new ContentLoadError('json', resource, error);
  }
}

/** Index内のLesson outlineをCourse教材順で検索する。 */
function findLessonOutline(index: CourseIndex, lessonId: string) {
  return index.phases
    .flatMap(({ chapters }) => chapters)
    .flatMap(({ lessons }) => lessons)
    .find(({ id }) => id === lessonId);
}

export class CourseContentRepository implements CourseContentRepositoryContract {
  private readonly resources = new Map<string, Promise<unknown>>();

  /** 同じresourceと期待SHAのpending／fulfilled Promiseを共有し、失敗だけ除去する。 */
  private singleFlight<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const current = this.resources.get(key) as Promise<T> | undefined;
    if (current !== undefined) return current;
    const guarded = operation().catch((error: unknown) => {
      if (this.resources.get(key) === guarded) this.resources.delete(key);
      throw error;
    });
    this.resources.set(key, guarded);
    return guarded;
  }

  /** Catalog v3を取得し、strictな軽量公開契約へ変換する。 */
  async loadCatalog(baseUrl: string): Promise<CourseCatalogV3> {
    const resource = resolveContentResource(baseUrl, CATALOG_V3_PATH);
    return this.singleFlight(JSON.stringify([resource, null]), async () => {
      const bytes = await fetchBytes(resource);
      const payload = parseJsonBytes(bytes, resource);
      try {
        return parseRuntimeCourseCatalogV3(payload);
      } catch (error) {
        throw new ContentLoadError('schema', resource, error);
      }
    });
  }

  /** Catalog entryが指すCourse Indexをbytes SHA検証後に取得する。 */
  async loadCourseIndex(baseUrl: string, entry: CourseCatalogEntryV3): Promise<CourseIndex> {
    const resource = resolveContentResource(baseUrl, entry.indexPath);
    return this.singleFlight(JSON.stringify([resource, entry.indexSha256]), async () => {
      const bytes = await fetchBytes(resource);
      await this.assertIntegrity(bytes, entry.indexSha256, resource);
      const payload = parseJsonBytes(bytes, resource);
      try {
        return parseIntegrityVerifiedCourseIndex(payload, entry);
      } catch (error) {
        throw new ContentLoadError('schema', resource, error);
      }
    });
  }

  /** Course Index内の既知Lessonだけをpath／SHA検証して取得する。 */
  async loadLesson(baseUrl: string, index: CourseIndex, lessonId: string): Promise<LessonManifest> {
    const outline = findLessonOutline(index, lessonId);
    if (outline === undefined) {
      throw new ContentLoadError('schema', lessonId);
    }
    const resource = resolveContentResource(baseUrl, outline.manifestPath);
    return this.singleFlight(JSON.stringify([resource, outline.manifestSha256]), async () => {
      const bytes = await fetchBytes(resource);
      await this.assertIntegrity(bytes, outline.manifestSha256, resource);
      const payload = parseJsonBytes(bytes, resource);
      try {
        return parseIntegrityVerifiedLessonManifest(payload, index, lessonId);
      } catch (error) {
        throw new ContentLoadError('schema', resource, error);
      }
    });
  }

  /** 現在Exerciseまでの同一workspaceを所有するLessonだけを教材順で取得する。 */
  async loadWorkspaceLessons(
    baseUrl: string,
    index: CourseIndex,
    currentExerciseId: string,
  ): Promise<readonly LessonManifest[]> {
    const lessonIds = resolveWorkspaceLessonIds(index, currentExerciseId);
    return Promise.all(lessonIds.map((lessonId) => this.loadLesson(baseUrl, index, lessonId)));
  }

  /** 任意prefetchを通常Lesson取得と同じcache／検証経路へ流す。 */
  async prefetchLesson(baseUrl: string, index: CourseIndex, lessonId: string): Promise<void> {
    await this.loadLesson(baseUrl, index, lessonId);
  }

  /** bytesのSHA計算失敗と不一致をintegrityへ分類する。 */
  private async assertIntegrity(
    bytes: ArrayBuffer,
    expectedSha256: string,
    resource: string,
  ): Promise<void> {
    let actualSha256: string;
    try {
      actualSha256 = await sha256Hex(bytes);
    } catch (error) {
      throw new ContentLoadError('integrity', resource, error);
    }
    if (actualSha256 !== expectedSha256) throw new ContentLoadError('integrity', resource);
  }
}

export const courseContentRepository = new CourseContentRepository();
