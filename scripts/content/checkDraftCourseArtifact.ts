/** 草稿3CourseのSourceとdistを照合する。公開契約や一般Artifact Gateは扱わない。 */
import path from 'node:path';
import { CourseCatalogV3Schema } from '../../src/core/content/deliverySchema';
import type { LearningPathDefinition } from '../../src/core/content/types';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { compileCourse } from './compileCourse';
import { readBinaryFile, readUtf8File } from './io';
import { compileLearningPaths } from './learningPaths';
import { readSplitCourseArtifacts } from './readSplitCourseArtifacts';
import { PublicProvenanceManifestSchema } from './sourceSchema';
import { canonicalSha256, splitCourseArtifacts } from './splitCourseArtifacts';
import { createCourseCatalog, projectCourseForSplitDelivery } from './splitContentDelivery';
import { verifyContentReview } from './verifyContentReview';

const COURSES = {
  'python-practice': { label: 'Python実践', cli: 'checkPythonPracticeDraft.ts' },
  'python-oop': { label: 'Python OOP', cli: 'checkPythonOopDraft.ts' },
  tailwind: { label: 'Tailwind', cli: 'checkTailwindDraft.ts' },
} as const;

export type DraftCourseId = keyof typeof COURSES;

/** 未知のCourseをファイル読込前に拒否し、固定の表示名とCLI名だけを返す。 */
function resolveDraftCourse(courseId: DraftCourseId) {
  if (!Object.hasOwn(COURSES, courseId)) {
    throw new Error('草稿照合の対象はpython-practice・python-oop・tailwindだけです');
  }
  return COURSES[courseId];
}

/** 草稿Courseへのstepと前提参照を両方検出する。 */
function includesCourse(
  paths: readonly LearningPathDefinition[],
  targetCourseId: DraftCourseId,
): boolean {
  return paths.some(({ steps }) =>
    steps.some(
      ({ courseId, prerequisiteCourseIds }) =>
        courseId === targetCourseId || prerequisiteCourseIds.includes(targetCourseId),
    ),
  );
}

/**
 * 固定Courseの現在Sourceとdistを読み取り検査する。ファイルや承認状態は変更しない。
 * 不一致、published、Path登録、既存教材レビューの未達は例外で拒否する。
 * 成功はこの草稿入力の一致であり、公開候補全体の受入や公開許可ではない。
 */
export async function checkDraftCourseArtifact(
  root: string,
  distDir: string,
  courseId: DraftCourseId,
) {
  const { label } = resolveDraftCourse(courseId);
  const courseRoot = path.join(root, 'content', courseId);
  const compilation = await compileCourse(courseRoot);
  const expected = projectCourseForSplitDelivery(compilation.runtime);
  const catalog = CourseCatalogV3Schema.parse(
    JSON.parse(await readUtf8File(distDir, 'generated/content/catalog-v3.json')),
  );
  const entry = catalog.courses.find(({ id }) => id === courseId);
  const course = await readSplitCourseArtifacts(distDir, courseId);
  const sourcePaths = await compileLearningPaths(path.join(root, 'content/learning-paths'));
  if (
    expected.id !== courseId ||
    expected.publicationStatus !== 'draft' ||
    entry?.publicationStatus !== 'draft' ||
    course.publicationStatus !== 'draft'
  ) {
    throw new Error(`${label}のSource・Catalog・distはすべて草稿である必要があります`);
  }
  if (includesCourse(sourcePaths, courseId) || includesCourse(catalog.learningPaths, courseId)) {
    throw new Error(`${label}の草稿がLearningPathに登録されています`);
  }
  if (canonicalJson(course) !== canonicalJson(expected)) {
    throw new Error(`${label}のSource本文とdistが一致しません`);
  }
  const expectedEntry = createCourseCatalog([splitCourseArtifacts(expected).index], []).courses[0];
  if (canonicalJson(entry) !== canonicalJson(expectedEntry)) {
    throw new Error(`${label}のSourceとCatalogのmetadata・SHAが一致しません`);
  }
  const provenance = PublicProvenanceManifestSchema.parse(
    JSON.parse(await readUtf8File(distDir, expected.provenanceManifestPath)),
  );
  if (canonicalJson(provenance) !== canonicalJson(compilation.publicProvenance)) {
    throw new Error(`${label}のProvenanceがSourceと一致しません`);
  }
  for (const [assetPath, bytes] of compilation.assets) {
    const actual = await readBinaryFile(distDir, `generated/content/${assetPath}`);
    if (!Buffer.from(actual).equals(Buffer.from(bytes))) {
      throw new Error(`${label}のAssetがSourceと一致しません: ${assetPath}`);
    }
  }
  const review = await verifyContentReview({
    courseRoot,
    publicRoot: distDir,
    courseId,
    reviewPath: path.join(root, `docs/quality/content-review-${courseId}.yaml`),
  });
  return {
    courseId: course.id,
    status: 'draft-matched' as const,
    runtimeSha256: canonicalSha256(expected),
    lessonsReviewed: review.lessonsReviewed,
  };
}

/** 固定Course用CLIを実行し、失敗はstderrとexit1へ伝える。ファイルは変更しない。 */
export async function runDraftCourseCli(courseId: DraftCourseId): Promise<void> {
  try {
    const { cli } = resolveDraftCourse(courseId);
    const arguments_ = process.argv.slice(2);
    if (arguments_.length > 1 || arguments_[0]?.startsWith('-')) {
      throw new Error(`使い方: ${cli} [distのDirectory]`);
    }
    const report = await checkDraftCourseArtifact(
      process.cwd(),
      path.resolve(arguments_[0] ?? 'dist'),
      courseId,
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
