/** 公開済み分割教材をpath・bytes SHA・Schema検証して完全なCourseへ再構成する。 */
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  CourseCatalogV3Schema,
  CourseIndexSchema,
  LessonManifestSchema,
} from '../../src/core/content/deliverySchema';
import type { CourseManifest, LessonManifest } from '../../src/core/content/types';
import { readBinaryFile } from './io';
import { lessonManifestPath, reconstructCourseManifest } from './splitCourseArtifacts';

const CATALOG_PATH = 'generated/content/catalog-v3.json';

/** 公開bytesのSHA-256を小文字hexで返す。 */
function bytesSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** fatal UTF-8とJSON構文を検証して公開bytesをunknownへ変換する。 */
function parseJsonBytes(bytes: Uint8Array, relativePath: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(`公開教材JSONが不正です: ${relativePath}`, { cause: error });
  }
}

/** Indexに列挙されたLesson outlineを教材順で返す。 */
function lessonOutlines(index: ReturnType<typeof CourseIndexSchema.parse>) {
  return index.phases.flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons));
}

/** 公開rootからCatalog、Index、Lessonを検証し、完全なCourseを返す。 */
export async function readSplitCourseArtifacts(
  publicRoot: string,
  courseId: string,
): Promise<CourseManifest> {
  const catalogBytes = await readBinaryFile(publicRoot, CATALOG_PATH);
  const catalog = CourseCatalogV3Schema.parse(parseJsonBytes(catalogBytes, CATALOG_PATH));
  const entry = catalog.courses.find(({ id }) => id === courseId);
  if (entry === undefined) throw new Error(`Course CatalogにCourseがありません: ${courseId}`);

  const expectedIndexPath = `generated/content/courses/${courseId}/index.json`;
  if (entry.indexPath !== expectedIndexPath) {
    throw new Error(`Course Index pathが公開規約と一致しません: ${entry.indexPath}`);
  }
  const indexBytes = await readBinaryFile(publicRoot, entry.indexPath);
  if (bytesSha256(indexBytes) !== entry.indexSha256) {
    throw new Error(`Course IndexのSHAが一致しません: ${courseId}`);
  }
  const index = CourseIndexSchema.parse(parseJsonBytes(indexBytes, entry.indexPath));
  if (index.id !== entry.id || index.revision !== entry.revision) {
    throw new Error(`Course IndexのIDまたはrevisionがCatalogと一致しません: ${courseId}`);
  }

  const outlines = lessonOutlines(index);
  const expectedFileNames = new Set(outlines.map(({ id }) => `${id}.json`));
  const lessonDirectory = `generated/content/courses/${courseId}/lessons`;
  const directoryEntries = await readdir(path.join(publicRoot, lessonDirectory), {
    withFileTypes: true,
  });
  const unexpected = directoryEntries.find(
    (directoryEntry) => !directoryEntry.isFile() || !expectedFileNames.has(directoryEntry.name),
  );
  if (unexpected !== undefined) {
    throw new Error(`Indexにない余分なLesson Artifactです: ${unexpected.name}`);
  }
  if (directoryEntries.length !== expectedFileNames.size) {
    throw new Error(`Lesson Artifactが不足しています: ${courseId}`);
  }

  const lessons: LessonManifest[] = [];
  for (const outline of outlines) {
    const expectedLessonPath = lessonManifestPath(courseId, outline.id);
    if (outline.manifestPath !== expectedLessonPath) {
      throw new Error(`Lesson Manifest pathが公開規約と一致しません: ${outline.id}`);
    }
    const lessonBytes = await readBinaryFile(publicRoot, outline.manifestPath);
    if (bytesSha256(lessonBytes) !== outline.manifestSha256) {
      throw new Error(`Lesson ManifestのSHAが一致しません: ${outline.id}`);
    }
    lessons.push(LessonManifestSchema.parse(parseJsonBytes(lessonBytes, outline.manifestPath)));
  }

  return reconstructCourseManifest(index, lessons);
}
