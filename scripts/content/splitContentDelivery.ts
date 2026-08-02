/** 分割教材の公開treeをproduction未接続のstagingへ決定的に構築する。 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CourseCatalogV3Schema } from '../../src/core/content/deliverySchema';
import { CourseManifestSchema } from '../../src/core/content/schema';
import { lessonStartTarget } from '../../src/core/content/lessonStart';
import type {
  CourseCatalogV3,
  CourseIndex,
  CourseManifest,
  LearningPathDefinition,
} from '../../src/core/content/types';
import { stringifyCanonicalJson, type CompiledCourseArtifacts } from './compileCourse';
import { resolveInside } from './io';
import {
  canonicalSha256,
  splitCourseArtifacts,
  type SplitCourseArtifacts,
} from './splitCourseArtifacts';

export interface SplitContentDeliveryCourse {
  readonly compilation: CompiledCourseArtifacts;
  readonly split: SplitCourseArtifacts;
}

export interface SplitContentDelivery {
  readonly catalog: CourseCatalogV3;
  readonly courses: readonly SplitContentDeliveryCourse[];
}

/** 公開先だけprovenance pathをCourse directory配下へ投影する。 */
export function projectCourseForSplitDelivery(course: CourseManifest): CourseManifest {
  return CourseManifestSchema.parse({
    ...course,
    provenanceManifestPath: `generated/content/courses/${course.id}/provenance.json`,
  });
}

/** Course Index列とLearningPathからintegrity付きCatalog v3を作る。 */
export function createCourseCatalog(
  indexes: readonly CourseIndex[],
  learningPaths: readonly LearningPathDefinition[],
): CourseCatalogV3 {
  return CourseCatalogV3Schema.parse({
    schemaVersion: 3,
    courses: indexes
      .map((index) => ({
        id: index.id,
        title: index.title,
        description: index.description,
        audience: index.audience,
        estimatedMinutes: index.estimatedMinutes,
        revision: index.revision,
        publicationStatus: index.publicationStatus,
        indexPath: `generated/content/courses/${index.id}/index.json`,
        indexSha256: canonicalSha256(index),
        lessonStarts: index.phases.flatMap(({ chapters }) =>
          [...chapters]
            .sort((left, right) => left.sequence - right.sequence)
            .flatMap(({ lessons }) =>
              lessons.map((lesson) => ({
                lessonId: lesson.id,
                target: lessonStartTarget(lesson),
              })),
            ),
        ),
      }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
    learningPaths,
  });
}

/** Compiler結果を公開用Courseへ投影し、分割treeのin-memory modelを作る。 */
export function buildSplitContentDelivery(
  compilations: readonly CompiledCourseArtifacts[],
  learningPaths: readonly LearningPathDefinition[],
): SplitContentDelivery {
  const courses = compilations.map((compilation) => ({
    compilation,
    split: splitCourseArtifacts(projectCourseForSplitDelivery(compilation.runtime)),
  }));
  return {
    catalog: createCourseCatalog(
      courses.map(({ split }) => split.index),
      learningPaths,
    ),
    courses,
  };
}

/** generated/content起点のPublic pathをstaging相対pathへ変換する。 */
function toStagingRelativePath(publicPath: string): string {
  const prefix = 'generated/content/';
  if (!publicPath.startsWith(prefix)) {
    throw new Error(`分割Artifact pathは${prefix}配下である必要があります: ${publicPath}`);
  }
  return publicPath.slice(prefix.length);
}

type StagedFile = string | Uint8Array;

/** 同じ公開pathへの上書きを拒否してstaging fileを登録する。 */
function registerStagedFile(
  files: Map<string, StagedFile>,
  relativePath: string,
  value: StagedFile,
): void {
  if (files.has(relativePath))
    throw new Error(`分割Artifact pathが重複しています: ${relativePath}`);
  files.set(relativePath, value);
}

/** Catalog、Index、Lesson、Provenance、Assetを指定staging Rootへ書く。 */
export async function writeSplitContentDeliveryTree(
  stagingRoot: string,
  delivery: SplitContentDelivery,
): Promise<void> {
  const files = new Map<string, StagedFile>();
  registerStagedFile(files, 'catalog-v3.json', stringifyCanonicalJson(delivery.catalog));
  for (const course of [...delivery.courses].sort((left, right) =>
    left.split.index.id < right.split.index.id
      ? -1
      : left.split.index.id > right.split.index.id
        ? 1
        : 0,
  )) {
    const { compilation, split } = course;
    const courseId = split.index.id;
    registerStagedFile(
      files,
      `courses/${courseId}/index.json`,
      stringifyCanonicalJson(split.index),
    );
    for (const manifest of split.lessons) {
      const outline = split.index.phases
        .flatMap(({ chapters }) => chapters)
        .flatMap(({ lessons }) => lessons)
        .find(({ id }) => id === manifest.lessonId);
      if (outline === undefined) {
        throw new Error(`Lesson outlineがありません: ${manifest.lessonId}`);
      }
      registerStagedFile(
        files,
        toStagingRelativePath(outline.manifestPath),
        stringifyCanonicalJson(manifest),
      );
    }
    registerStagedFile(
      files,
      `courses/${courseId}/provenance.json`,
      stringifyCanonicalJson(compilation.publicProvenance),
    );
    for (const assetPath of [...compilation.assets.keys()].sort()) {
      const bytes = compilation.assets.get(assetPath);
      if (bytes !== undefined) registerStagedFile(files, assetPath, bytes);
    }
  }

  await mkdir(stagingRoot, { recursive: true });
  for (const relativePath of [...files.keys()].sort()) {
    const target = resolveInside(stagingRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, files.get(relativePath)!);
  }
}
