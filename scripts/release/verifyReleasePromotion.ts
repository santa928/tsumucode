import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { hashFile, SYNTHETIC_PROGRESS_BUNDLE_PATH } from './releaseHashes';
import {
  loadApprovedReleaseApproval,
  verifyApprovedQualityEvidence,
} from './verifyReleaseApproval';
import {
  PostDeployVerificationSchema,
  ReleaseApprovalSchema,
  ReleaseHistorySchema,
  type PublishedRelease,
  type ReleaseHistory,
} from './releaseSchema';
import { verifyPublishedTag } from './verifyReleaseTarget';
import { parseReleaseReport, type ReleaseReportInput } from './writeReleaseReport';

const execFileAsync = promisify(execFile);
const HISTORY_PATH = 'content/html-css/release-history.yaml';
const APPROVAL_PATH = 'docs/quality/release-approval.yaml';
const PROMOTION_ALLOWED_FILES = new Set([HISTORY_PATH, SYNTHETIC_PROGRESS_BUNDLE_PATH]);

/** 値をcanonical JSONで比較し、Release promotionの改変箇所を特定する。 */
function assertCanonicalEqual(name: string, actual: unknown, expected: unknown): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`Release promotionの${name}が承認済みcandidateと一致しません`);
  }
}

type PostDeployReleaseBinding = Pick<
  PublishedRelease,
  | 'revision'
  | 'tag'
  | 'sourceCommit'
  | 'workflowHeadCommit'
  | 'workflowRunId'
  | 'workflowRunAttempt'
  | 'reportArtifactId'
  | 'reportArtifactDigest'
  | 'pageUrl'
  | 'postDeployVerificationPath'
  | 'postDeployVerificationSha256'
>;

/** Release revisionから上書き不能な公開後検証record pathを決める。 */
export function expectedPostDeployVerificationPath(revision: string): string {
  return `docs/quality/post-deploy/${revision}.yaml`;
}

/** 公開後の独立確認が同じRelease evidenceへ完全に結び付くことを検証する。 */
export function validatePostDeployVerification(
  source: unknown,
  release: PostDeployReleaseBinding,
  actualSha256: string,
): void {
  const verification = PostDeployVerificationSchema.parse(source);
  const expectedPath = expectedPostDeployVerificationPath(release.revision);
  if (release.postDeployVerificationPath !== expectedPath) {
    throw new Error(
      `公開後検証record pathがrevision別の固定pathではありません: ${release.postDeployVerificationPath}`,
    );
  }
  if (actualSha256 !== release.postDeployVerificationSha256) {
    throw new Error('公開後検証recordのSHA-256が公開台帳と一致しません');
  }
  if (
    verification.status !== 'approved' ||
    verification.environmentApprovalStatus !== 'passed' ||
    verification.pageVerificationStatus !== 'passed' ||
    verification.reportVerificationStatus !== 'passed' ||
    verification.tagVerificationStatus !== 'passed' ||
    verification.verifiedBy === 'draft' ||
    verification.verifiedAt === 'draft'
  ) {
    throw new Error(
      '公開後検証はEnvironment・公開URL・Report・tagを確認した承認済み記録が必要です',
    );
  }
  const bindings = {
    revision: release.revision,
    tag: release.tag,
    sourceCommit: release.sourceCommit,
    workflowHeadCommit: release.workflowHeadCommit,
    workflowRunId: release.workflowRunId,
    workflowRunAttempt: release.workflowRunAttempt,
    reportArtifactId: release.reportArtifactId,
    reportArtifactDigest: release.reportArtifactDigest,
    pageUrl: release.pageUrl,
  };
  for (const [key, expected] of Object.entries(bindings)) {
    if (verification[key as keyof typeof bindings] !== expected) {
      throw new Error(`公開後検証の${key}が公開台帳と一致しません`);
    }
  }
}

/** 公開台帳が参照するrevision別recordの通常File・hash・内容を再検証する。 */
export async function verifyStoredPostDeployVerification(
  repositoryRoot: string,
  release: PublishedRelease,
): Promise<void> {
  const root = path.resolve(repositoryRoot);
  const expectedPath = expectedPostDeployVerificationPath(release.revision);
  if (release.postDeployVerificationPath !== expectedPath) {
    throw new Error('公開後検証record pathが公開Release revisionと一致しません');
  }
  const absolute = path.resolve(root, release.postDeployVerificationPath);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error('公開後検証recordがRepository外を指しています');
  }
  const stats = await lstat(absolute);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('公開後検証recordはRepository内の通常Fileである必要があります');
  }
  const source = await readFile(absolute, 'utf8');
  validatePostDeployVerification(parse(source), release, await hashFile(absolute));
}

/** Release Reportが公開台帳へ追記するimmutable evidenceと一致するか検証する。 */
export function assertReleaseReportMatches(
  release: PublishedRelease,
  report: ReleaseReportInput,
): void {
  const expected = {
    sourceSha: release.sourceCommit,
    workflowHeadSha: release.workflowHeadCommit,
    releaseMode: 'candidate',
    artifactDigest: release.canonicalDistSha256,
    courseHash: release.courseManifestSha256,
    provenanceHash: release.publicProvenanceSha256,
    qualityArtifactId: release.qualityArtifactId,
    qualityArtifactDigest: release.qualityArtifactDigest,
    workflowRunId: release.workflowRunId,
    workflowRunAttempt: String(release.workflowRunAttempt),
    pageUrl: release.pageUrl,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (report[key as keyof ReleaseReportInput] !== value) {
      throw new Error(`Release Reportの${key}が公開台帳と一致しません`);
    }
  }
}

/** 承認済みcandidateが1件だけ追記され、次candidateが安全にdraftへ戻ったことを検証する。 */
export function assertPromotionLedger(
  approvedHistory: ReleaseHistory,
  promotedHistory: ReleaseHistory,
  report: ReleaseReportInput,
): PublishedRelease {
  const approvedCandidate = approvedHistory.candidate;
  if (
    approvedCandidate.status !== 'approved' ||
    approvedCandidate.verifiedSourceCommit === 'draft' ||
    approvedCandidate.canonicalDistSha256 === 'draft' ||
    approvedCandidate.courseManifestSha256 === 'draft' ||
    approvedCandidate.publicProvenanceSha256 === 'draft' ||
    approvedCandidate.persistentIdsSha256 === 'draft'
  ) {
    throw new Error('Promotion元candidateが承認済みの完全なbindingではありません');
  }
  if (promotedHistory.releases.length !== approvedHistory.releases.length + 1) {
    throw new Error('Release promotionは公開台帳へ1件だけ追記する必要があります');
  }
  assertCanonicalEqual(
    '既存Release prefix',
    promotedHistory.releases.slice(0, -1),
    approvedHistory.releases,
  );
  const appended = promotedHistory.releases.at(-1);
  if (appended === undefined) throw new Error('Release promotionの追記Recordがありません');
  if (appended.tag !== `tsumucode-release-${approvedCandidate.revision}`) {
    throw new Error('追記Releaseのtagがcandidate revisionと一致しません');
  }
  const scalarBindings = {
    revision: approvedCandidate.revision,
    sourceCommit: approvedCandidate.verifiedSourceCommit,
    canonicalDistSha256: approvedCandidate.canonicalDistSha256,
    courseManifestSha256: approvedCandidate.courseManifestSha256,
    publicProvenanceSha256: approvedCandidate.publicProvenanceSha256,
    persistentIdsSha256: approvedCandidate.persistentIdsSha256,
    previousReleaseTag: approvedCandidate.previousReleaseTag,
    syntheticProgressBundlePath: approvedCandidate.syntheticProgressBundlePath,
  };
  for (const [key, value] of Object.entries(scalarBindings)) {
    if (appended[key as keyof PublishedRelease] !== value) {
      throw new Error(`追記Releaseの${key}が承認済みcandidateと一致しません`);
    }
  }
  assertCanonicalEqual('persistentIds', appended.persistentIds, approvedCandidate.persistentIds);
  assertCanonicalEqual('tombstonedIds', appended.tombstonedIds, approvedCandidate.tombstonedIds);
  assertCanonicalEqual('migrations', appended.migrations, approvedCandidate.migrations);
  assertReleaseReportMatches(appended, report);

  const next = promotedHistory.candidate;
  if (
    next.status !== 'draft' ||
    next.verifiedSourceCommit !== 'draft' ||
    next.canonicalDistSha256 !== 'draft' ||
    next.courseManifestSha256 !== 'draft' ||
    next.publicProvenanceSha256 !== 'draft' ||
    next.persistentIdsSha256 !== 'draft' ||
    next.persistentIds.length !== 0
  ) {
    throw new Error('Promotion後candidateはbindingとIDを空にしたdraftである必要があります');
  }
  if (next.revision !== appended.revision || next.previousReleaseTag !== appended.tag) {
    throw new Error('Promotion後candidateが最新Releaseへ接続されていません');
  }
  assertCanonicalEqual('次candidate tombstonedIds', next.tombstonedIds, appended.tombstonedIds);
  assertCanonicalEqual('次candidate migrations', next.migrations, appended.migrations);
  if (next.syntheticProgressBundlePath !== appended.syntheticProgressBundlePath) {
    throw new Error('Promotion後candidateの合成Bundle pathが追記Releaseと一致しません');
  }
  return appended;
}

/** 承認source以降の追跡済み・未追跡変更をRelease metadataと品質記録だけへ限定する。 */
export async function assertPromotionDiff(
  repositoryRoot: string,
  sourceCommit: string,
): Promise<void> {
  const [{ stdout: trackedOutput }, { stdout: untrackedOutput }] = await Promise.all([
    execFileAsync('git', ['diff', '--name-only', '-z', sourceCommit, '--', '.'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }),
    execFileAsync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }),
  ]);
  const changed = [
    ...new Set([...trackedOutput.split('\0'), ...untrackedOutput.split('\0')].filter(Boolean)),
  ];
  const forbidden = changed.filter(
    (relative) =>
      !relative.startsWith('docs/superpowers/') &&
      !relative.startsWith('docs/quality/') &&
      !PROMOTION_ALLOWED_FILES.has(relative),
  );
  if (forbidden.length > 0) {
    throw new Error(`PromotionにProduct変更を含められません: ${forbidden.join(', ')}`);
  }
}

/** Git source、Approval、Report、台帳追記、annotated tagを一括検証する。 */
export async function verifyReleasePromotion(
  repositoryRoot: string,
  promotedHistory: ReleaseHistory,
  reportPath: string,
): Promise<void> {
  const root = path.resolve(repositoryRoot);
  const absoluteReport = path.resolve(root, reportPath);
  if (!absoluteReport.startsWith(`${root}${path.sep}`)) {
    throw new Error('Release Report pathがRepository外を指しています');
  }
  const reportStats = await lstat(absoluteReport);
  if (reportStats.isSymbolicLink() || !reportStats.isFile()) {
    throw new Error('Release ReportはRepository内の通常Fileである必要があります');
  }
  const report = parseReleaseReport(await readFile(absoluteReport, 'utf8'));
  const approval = await loadApprovedReleaseApproval(root);
  await assertPromotionDiff(root, approval.verifiedSourceCommit);
  const { stdout: approvedSyntheticBundle } = await execFileAsync(
    'git',
    ['show', `${report.workflowHeadSha}:${SYNTHETIC_PROGRESS_BUNDLE_PATH}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  await verifyApprovedQualityEvidence(root, approval, {
    workflowHead: report.workflowHeadSha,
    candidateTreeFileOverrides: new Map([
      [SYNTHETIC_PROGRESS_BUNDLE_PATH, new TextEncoder().encode(approvedSyntheticBundle)],
    ]),
  });
  if (report.sourceSha !== approval.verifiedSourceCommit) {
    throw new Error('Release ReportのsourceがRelease approvalと一致しません');
  }
  await execFileAsync(
    'git',
    ['merge-base', '--is-ancestor', approval.verifiedSourceCommit, report.workflowHeadSha],
    { cwd: root },
  );
  const { stdout: currentHeadOutput } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  await execFileAsync(
    'git',
    ['merge-base', '--is-ancestor', report.workflowHeadSha, currentHeadOutput.trim()],
    { cwd: root },
  );

  const [{ stdout: approvedHistorySource }, { stdout: approvalAtWorkflowHeadSource }] =
    await Promise.all([
      execFileAsync('git', ['show', `${report.workflowHeadSha}:${HISTORY_PATH}`], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      }),
      execFileAsync('git', ['show', `${report.workflowHeadSha}:${APPROVAL_PATH}`], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }),
    ]);
  const approvalAtWorkflowHead = ReleaseApprovalSchema.parse(parse(approvalAtWorkflowHeadSource));
  assertCanonicalEqual('workflow head approval', approvalAtWorkflowHead, approval);
  const approvedHistory = ReleaseHistorySchema.parse(parse(approvedHistorySource));
  if (
    approvedHistory.candidate.verifiedSourceCommit !== approval.verifiedSourceCommit ||
    approvedHistory.candidate.canonicalDistSha256 !== approval.canonicalDistSha256 ||
    approvedHistory.candidate.courseManifestSha256 !== approval.courseManifestSha256 ||
    approvedHistory.candidate.publicProvenanceSha256 !== approval.publicProvenanceSha256
  ) {
    throw new Error('Deploy workflow headのcandidateとRelease approvalが一致しません');
  }
  const appended = assertPromotionLedger(approvedHistory, promotedHistory, report);
  await verifyPublishedTag(root, appended);
  await verifyStoredPostDeployVerification(root, appended);
}
