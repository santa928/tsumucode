import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { checkDraftCourseArtifact } from '../content/checkDraftCourseArtifact';
import { readSplitCourseArtifacts } from '../content/readSplitCourseArtifacts';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { checkStaticArtifact } from './checkStaticArtifact';
import { DraftCourseQualityRecordSchema } from './draftCourseQualitySchema';
import {
  resolveDraftReleaseCourseContract,
  type DraftReleaseCourseId,
} from './draftReleaseCourseContracts';
import {
  assertDraftSourceUnchanged,
  readDraftCandidateGit,
  readDraftSourceTree,
} from './draftQualityInputHashes';
import { hashDirectory, hashDraftReleaseCandidateTree, hashFile } from './releaseHashes';
import { CommitShaSchema } from './releaseSchema';
import { verifyDraftCourseQualityEvidence } from './verifyDraftCourseQualityEvidence';

/**
 * 草稿一致と全体Artifact検査を行い、固定Sourceから不変な実候補のhashを測る。
 * Sourceはmetadata追加前の祖先でもよいが、宣言済み6記録以外の差分は拒否する。
 */
export async function measureDraftReleaseCandidate(
  repositoryRoot: string,
  distDirectory: string,
  courseId: DraftReleaseCourseId,
  sourceCommit?: string,
) {
  const root = await realpath(repositoryRoot);
  const dist = path.resolve(root, distDirectory);
  const contract = resolveDraftReleaseCourseContract(courseId);
  const source = CommitShaSchema.parse(
    sourceCommit ?? (await readDraftCandidateGit(root, ['rev-parse', 'HEAD'])).trim(),
  );
  await assertDraftSourceUnchanged(root, source);
  const draft = await checkDraftCourseArtifact(root, dist, courseId);
  const artifact = await checkStaticArtifact(dist, 'html-css');
  const course = await readSplitCourseArtifacts(dist, courseId);
  const lessons = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons.map(({ id }) => id)),
  );
  if (canonicalJson(lessons) !== canonicalJson(contract.lessonIds)) {
    throw new Error('実候補のLesson IDと順序が専用契約と一致しません');
  }
  const candidate = {
    sourceCommit: source,
    sourceTree: await readDraftSourceTree(root, source),
    productTreeSha256: await hashDraftReleaseCandidateTree(root, courseId),
    canonicalDistSha256: await hashDirectory(dist),
    runtimeSha256: draft.runtimeSha256,
    publicProvenanceSha256: await hashFile(path.join(dist, contract.publicProvenancePath)),
    contentReviewSha256: await hashFile(path.join(root, contract.contentReviewPath)),
  };
  await assertDraftSourceUnchanged(root, source);
  return { candidate, lessonsReviewed: draft.lessonsReviewed, staticFiles: artifact.files };
}

/** 固定品質記録と私有原本を検証する。成功も公開承認には変換しない。 */
export async function checkDraftReleaseCandidate(
  repositoryRoot: string,
  distDirectory: string,
  evidenceRoot: string,
  courseId: DraftReleaseCourseId,
) {
  const root = await realpath(repositoryRoot);
  const contract = resolveDraftReleaseCourseContract(courseId);
  const qualityPath = path.join(root, contract.qualityPath);
  if (!(await lstat(qualityPath)).isFile() || (await realpath(qualityPath)) !== qualityPath) {
    throw new Error('専用の品質記録には固定pathの通常fileが必要です');
  }
  const record = DraftCourseQualityRecordSchema.parse(parse(await readFile(qualityPath, 'utf8')));
  if (record.courseId !== courseId) throw new Error('専用品質記録のCourseが一致しません');
  if (record.status === 'draft' || record.candidate === null) {
    throw new Error('専用品質記録はdraftです。実操作・原本照合・候補bindingは未完了です');
  }
  const measured = await measureDraftReleaseCandidate(
    root,
    distDirectory,
    courseId,
    record.candidate.sourceCommit,
  );
  await verifyDraftCourseQualityEvidence(root, evidenceRoot, record, measured.candidate);
  return {
    courseId,
    status: 'draft-candidate-verified' as const,
    publicationAuthorized: false as const,
    ...measured,
  };
}

/** 固定3Courseの私有原本検査CLI。未知flagと対象外Courseを拒否し、書込みは行わない。 */
export async function runDraftReleaseCandidateCli(arguments_: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: arguments_,
    allowPositionals: true,
    options: {
      'course-id': { type: 'string' },
      'evidence-root': { type: 'string' },
      measure: { type: 'boolean', default: false },
      'source-sha': { type: 'string' },
    },
  });
  if (
    positionals.length > 1 ||
    (!values.measure &&
      (values['evidence-root'] === undefined || values['source-sha'] !== undefined)) ||
    (values.measure && values['evidence-root'] !== undefined)
  ) {
    throw new Error(
      '使い方: checkDraftReleaseCandidate.ts [dist] --course-id <固定Course> (--measure [--source-sha <元Source>] | --evidence-root <私有Directory>)',
    );
  }
  const contract = resolveDraftReleaseCourseContract(values['course-id']);
  if (values.measure) {
    const measured = await measureDraftReleaseCandidate(
      process.cwd(),
      positionals[0] ?? 'dist',
      contract.courseId,
      values['source-sha'],
    );
    console.log(
      JSON.stringify(
        {
          courseId: contract.courseId,
          status: 'draft-candidate-measured',
          publicationAuthorized: false,
          ...measured,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (values['evidence-root'] === undefined) throw new Error('私有原本Directoryが必要です');
  const report = await checkDraftReleaseCandidate(
    process.cwd(),
    path.resolve(positionals[0] ?? 'dist'),
    path.resolve(values['evidence-root']),
    contract.courseId,
  );
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDraftReleaseCandidateCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
