/** Python実践の草稿Sourceと検査するdistを照合し、公開承認とは区別する。 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

const COURSE_ID = 'python-practice';

/** 草稿Courseへのstepと前提参照を両方検出する。 */
function includesPractice(paths: readonly LearningPathDefinition[]): boolean {
  return paths.some(({ steps }) =>
    steps.some(
      ({ courseId, prerequisiteCourseIds }) =>
        courseId === COURSE_ID || prerequisiteCourseIds.includes(COURSE_ID),
    ),
  );
}

/**
 * 固定Courseの現在Sourceとdistを読み取り検査する。ファイルや承認状態は変更しない。
 * 不一致、published、Path登録、既存教材レビューの未達は例外で拒否する。
 * 成功はこの草稿入力の一致であり、公開候補全体の受入や公開許可ではない。
 */
export async function checkPythonPracticeDraft(root: string, distDir: string) {
  const courseRoot = path.join(root, 'content', COURSE_ID);
  const compilation = await compileCourse(courseRoot);
  const expected = projectCourseForSplitDelivery(compilation.runtime);
  const catalog = CourseCatalogV3Schema.parse(
    JSON.parse(await readUtf8File(distDir, 'generated/content/catalog-v3.json')),
  );
  const entry = catalog.courses.find(({ id }) => id === COURSE_ID);
  const course = await readSplitCourseArtifacts(distDir, COURSE_ID);
  const sourcePaths = await compileLearningPaths(path.join(root, 'content/learning-paths'));
  if (
    expected.id !== COURSE_ID ||
    expected.publicationStatus !== 'draft' ||
    entry?.publicationStatus !== 'draft' ||
    course.publicationStatus !== 'draft'
  ) {
    throw new Error('Python実践のSource・Catalog・distはすべて草稿である必要があります');
  }
  if (includesPractice(sourcePaths) || includesPractice(catalog.learningPaths)) {
    throw new Error('Python実践の草稿がLearningPathに登録されています');
  }
  if (canonicalJson(course) !== canonicalJson(expected)) {
    throw new Error('Python実践のSource本文とdistが一致しません');
  }
  const expectedEntry = createCourseCatalog([splitCourseArtifacts(expected).index], []).courses[0];
  if (canonicalJson(entry) !== canonicalJson(expectedEntry)) {
    throw new Error('Python実践のSourceとCatalogのmetadata・SHAが一致しません');
  }
  const provenance = PublicProvenanceManifestSchema.parse(
    JSON.parse(await readUtf8File(distDir, expected.provenanceManifestPath)),
  );
  if (canonicalJson(provenance) !== canonicalJson(compilation.publicProvenance)) {
    throw new Error('Python実践のProvenanceがSourceと一致しません');
  }
  for (const [assetPath, bytes] of compilation.assets) {
    const actual = await readBinaryFile(distDir, `generated/content/${assetPath}`);
    if (!Buffer.from(actual).equals(Buffer.from(bytes))) {
      throw new Error(`Python実践のAssetがSourceと一致しません: ${assetPath}`);
    }
  }
  const review = await verifyContentReview({
    courseRoot,
    publicRoot: distDir,
    courseId: COURSE_ID,
    reviewPath: path.join(root, 'docs/quality/content-review-python-practice.yaml'),
  });
  return {
    courseId: course.id,
    status: 'draft-matched' as const,
    runtimeSha256: canonicalSha256(expected),
    lessonsReviewed: review.lessonsReviewed,
  };
}

/** 明示されたdistだけを現在のRepository Sourceへ照合し、結果をJSONで返す。 */
async function runCli(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length > 1 || arguments_[0]?.startsWith('-')) {
    throw new Error('使い方: checkPythonPracticeDraft.ts [distのDirectory]');
  }
  const report = await checkPythonPracticeDraft(
    process.cwd(),
    path.resolve(arguments_[0] ?? 'dist'),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
