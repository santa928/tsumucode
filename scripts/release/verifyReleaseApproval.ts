import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { ContentReviewLedgerSchema } from '../content/verifyContentReview';
import {
  calculateArtifactHashes,
  hashFile,
  hashReleaseCandidateTree,
  type ArtifactHashes,
} from './releaseHashes';
import {
  ReleaseApprovalSchema,
  ReleaseHistorySchema,
  Sha256Schema,
  type ReleaseApproval,
} from './releaseSchema';

const execFileAsync = promisify(execFile);

export type ManualQualityRecordName =
  | 'contentReview'
  | 'visualReview'
  | 'accessibilityManual'
  | 'noviceObservation'
  | 'releaseChecklist';

export interface SourceApprovalResult {
  readonly verifiedSourceCommit: string;
  readonly candidateTreeSha256: string;
  readonly canonicalDistSha256: string;
  readonly courseManifestSha256: string;
  readonly publicProvenanceSha256: string;
  readonly revision: string;
}

export interface ApprovedQualityEvidenceOptions {
  readonly workflowHead?: string;
  readonly candidateTreeFileOverrides?: ReadonlyMap<string, Uint8Array>;
}

/** 期待hashと実測hashを名前付きで比較し、stale recordを明示する。 */
export function assertDigestMatch(name: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      `${name}のSHA-256が承認値と一致しません: expected=${expected} actual=${actual}`,
    );
  }
}

/** Markdown先頭の `- key: `value`` metadataを重複なしで読む。 */
function parseManualRecordMetadata(
  recordName: string,
  source: string,
): ReadonlyMap<string, string> {
  const metadata = new Map<string, string>();
  const pattern = /^- ([A-Za-z][A-Za-z0-9]*): `([^`\r\n]*)`$/gmu;
  for (const match of source.matchAll(pattern)) {
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined) continue;
    if (metadata.has(key)) {
      throw new Error(`${recordName}のmetadataが重複しています: ${key}`);
    }
    metadata.set(key, value);
  }
  return metadata;
}

/** Manual recordの文字列metadataを期待値と比較する。 */
function requireMetadata(
  recordName: string,
  metadata: ReadonlyMap<string, string>,
  key: string,
  expected: string,
): void {
  const actual = metadata.get(key);
  if (actual !== expected) {
    throw new Error(
      `${recordName}.${key}は${expected}である必要があります: ${actual ?? 'missing'}`,
    );
  }
}

/** Manual recordの非負整数metadataを読み、下限・一致条件を検証する。 */
function requireCount(
  recordName: string,
  metadata: ReadonlyMap<string, string>,
  key: string,
  condition: (value: number) => boolean,
  expectation: string,
): void {
  const source = metadata.get(key);
  if (source === undefined || !/^(?:0|[1-9]\d*)$/u.test(source) || !condition(Number(source))) {
    throw new Error(
      `${recordName}.${key}は${expectation}である必要があります: ${source ?? 'missing'}`,
    );
  }
}

/** 品質記録がReleaseに使用できる機械可読な承認状態かをfail-closedで判定する。 */
export function validateManualQualityRecord(
  recordName: ManualQualityRecordName,
  source: string,
): void {
  if (recordName === 'contentReview') {
    const ledger = ContentReviewLedgerSchema.parse(parse(source));
    if (ledger.releaseStatus !== 'approved') {
      throw new Error('contentReview.releaseStatusはapprovedである必要があります');
    }
    if (ledger.lessons.length !== 51) {
      throw new Error(
        `contentReviewは51 Lessonを含む必要があります: ${String(ledger.lessons.length)}`,
      );
    }
    const lessonIds = new Set<string>();
    for (const review of ledger.lessons) {
      if (lessonIds.has(review.lessonId)) {
        throw new Error(`contentReviewのLesson IDが重複しています: ${review.lessonId}`);
      }
      lessonIds.add(review.lessonId);
      if (
        review.authorId === review.reviewerId ||
        review.accuracy !== 'approved' ||
        review.goalExerciseAlignment !== 'approved' ||
        review.unexplainedTerms !== 0 ||
        review.hintLeakage !== 0 ||
        !review.examplesExecuted ||
        review.decision !== 'approved'
      ) {
        throw new Error(`contentReviewのLessonが承認条件を満たしません: ${review.lessonId}`);
      }
    }
    return;
  }

  const metadata = parseManualRecordMetadata(recordName, source);
  requireMetadata(recordName, metadata, 'releaseStatus', 'approved');
  switch (recordName) {
    case 'visualReview':
      requireCount(recordName, metadata, 'reviewedScreens', (value) => value === 20, '20');
      requireCount(recordName, metadata, 'unresolvedFindings', (value) => value === 0, '0');
      requireMetadata(recordName, metadata, 'finalArtifactReviewed', 'true');
      return;
    case 'accessibilityManual':
      requireMetadata(recordName, metadata, 'journeyStatus', 'passed');
      requireMetadata(recordName, metadata, 'voiceOverStatus', 'not-required');
      requireCount(recordName, metadata, 'unresolvedFindings', (value) => value === 0, '0');
      requireCount(recordName, metadata, 'unperformedChecks', (value) => value === 0, '0');
      return;
    case 'noviceObservation':
      requireCount(recordName, metadata, 'participantCount', (value) => value >= 1, '1以上');
      requireCount(recordName, metadata, 'requiredCheckpoints', (value) => value === 5, '5');
      requireCount(recordName, metadata, 'approvedCheckpoints', (value) => value === 5, '5');
      requireMetadata(recordName, metadata, 'guidedProjectStatus', 'passed');
      requireMetadata(recordName, metadata, 'capstoneStatus', 'passed');
      requireCount(recordName, metadata, 'unresolvedFindings', (value) => value === 0, '0');
      return;
    case 'releaseChecklist':
      requireMetadata(recordName, metadata, 'checklistScope', 'pre-deploy');
      requireMetadata(recordName, metadata, 'postDeployVerificationPolicy', 'revision-record');
      requireMetadata(recordName, metadata, 'automatedGatesStatus', 'passed');
      requireMetadata(recordName, metadata, 'manualGatesStatus', 'passed');
      requireCount(recordName, metadata, 'pendingItems', (value) => value === 0, '0');
      requireCount(recordName, metadata, 'failedItems', (value) => value === 0, '0');
  }
}

/** CLI flag直後の値を取得する。 */
function argumentValue(arguments_: readonly string[], flag: string): string | undefined {
  const index = arguments_.indexOf(flag);
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag}へ値が必要です`);
  return value;
}

/** MarkdownまたはYAML品質記録から内部source/artifact bindingを読む。 */
function recordBindings(
  source: string,
  extension: string,
): {
  readonly verifiedSourceCommit: string;
  readonly canonicalDistSha256: string;
} {
  if (extension === '.yaml' || extension === '.yml') {
    const parsed = parse(source) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('品質記録YAMLがobjectではありません');
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.verifiedSourceCommit !== 'string' ||
      typeof record.canonicalDistSha256 !== 'string'
    ) {
      throw new Error('品質記録YAMLにsource/artifact bindingがありません');
    }
    return {
      verifiedSourceCommit: record.verifiedSourceCommit,
      canonicalDistSha256: record.canonicalDistSha256,
    };
  }

  const commit = /verifiedSourceCommit:\s*`([^`]+)`/u.exec(source)?.[1];
  const artifact = /canonicalDistSha256:\s*`([^`]+)`/u.exec(source)?.[1];
  if (commit === undefined || artifact === undefined) {
    throw new Error('品質記録Markdownにsource/artifact bindingがありません');
  }
  return { verifiedSourceCommit: commit, canonicalDistSha256: artifact };
}

/** draftを含まない承認済みRelease approvalを読み込む。 */
export async function loadApprovedReleaseApproval(
  repositoryRoot: string,
): Promise<ReleaseApproval & { readonly status: 'approved' }> {
  const approval = ReleaseApprovalSchema.parse(
    parse(await readFile(path.join(repositoryRoot, 'docs/quality/release-approval.yaml'), 'utf8')),
  );
  if (
    approval.status !== 'approved' ||
    approval.verifiedSourceCommit === 'draft' ||
    approval.candidateTreeSha256 === 'draft' ||
    approval.canonicalDistSha256 === 'draft' ||
    approval.courseManifestSha256 === 'draft' ||
    approval.publicProvenanceSha256 === 'draft' ||
    approval.visualBaselineSha256 === 'draft' ||
    approval.approvedAt === 'draft' ||
    approval.approvedBy === 'draft'
  ) {
    throw new Error('Release approvalが承認済みの完全なbindingではありません');
  }
  return approval as ReleaseApproval & { readonly status: 'approved' };
}

/** approvalとRelease Historyを読み、draftでない承認済みmetadataを返す。 */
async function loadApprovedMetadata(repositoryRoot: string): Promise<{
  readonly approval: ReleaseApproval & { readonly status: 'approved' };
  readonly history: ReturnType<typeof ReleaseHistorySchema.parse>;
}> {
  const approval = await loadApprovedReleaseApproval(repositoryRoot);
  const history = ReleaseHistorySchema.parse(
    parse(
      await readFile(path.join(repositoryRoot, 'content/html-css/release-history.yaml'), 'utf8'),
    ),
  );
  return { approval, history };
}

/** Git commit間のProduct差分が除外対象以外にないことを確認する。 */
export async function assertProductUnchanged(
  repositoryRoot: string,
  verifiedSourceCommit: string,
  workflowHead: string,
): Promise<void> {
  try {
    await execFileAsync(
      'git',
      [
        'diff',
        '--quiet',
        verifiedSourceCommit,
        workflowHead,
        '--',
        '.',
        ':(exclude)docs/superpowers/**',
        ':(exclude)docs/quality/**',
        ':(exclude)content/html-css/release-history.yaml',
      ],
      { cwd: repositoryRoot },
    );
  } catch (error) {
    if ((error as { readonly code?: number }).code === 1) {
      throw new Error('verified source commit以降にProduct treeが変更されています', {
        cause: error,
      });
    }
    throw error;
  }
}

/** 承認sourceからProductが不変で、全手動記録が同じsource/artifactへ承認済みか検証する。 */
export async function verifyApprovedQualityEvidence(
  repositoryRoot: string,
  approval: ReleaseApproval & { readonly status: 'approved' },
  options: ApprovedQualityEvidenceOptions = {},
): Promise<void> {
  const root = path.resolve(repositoryRoot);
  const workflowHead =
    options.workflowHead ??
    (
      await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      })
    ).stdout.trim();
  await execFileAsync(
    'git',
    ['merge-base', '--is-ancestor', approval.verifiedSourceCommit, workflowHead],
    { cwd: root },
  );
  await assertProductUnchanged(root, approval.verifiedSourceCommit, workflowHead);
  assertDigestMatch(
    'Release Candidate tree',
    await hashReleaseCandidateTree(root, options.candidateTreeFileOverrides),
    approval.candidateTreeSha256,
  );
  for (const recordName of Object.keys(approval.records) as ManualQualityRecordName[]) {
    const record = approval.records[recordName];
    const absolute = path.resolve(root, record.path);
    if (!absolute.startsWith(`${root}${path.sep}`)) {
      throw new Error(`品質記録がRepository外を指しています: ${record.path}`);
    }
    if (record.sha256 === 'draft') throw new Error(`${recordName}のhashがdraftです`);
    const source = await readFile(absolute, 'utf8');
    validateManualQualityRecord(recordName, source);
    const bindings = recordBindings(source, path.extname(record.path));
    if (
      bindings.verifiedSourceCommit !== approval.verifiedSourceCommit ||
      bindings.canonicalDistSha256 !== approval.canonicalDistSha256
    ) {
      throw new Error(`${recordName}の内部bindingがRelease approvalと一致しません`);
    }
    assertDigestMatch(recordName, await hashFile(absolute), record.sha256);
  }
}

/** 手動記録、candidate tree、source commitのbindingを検証する。 */
export async function verifyReleaseSourceApproval(
  repositoryRoot: string,
): Promise<SourceApprovalResult> {
  const root = path.resolve(repositoryRoot);
  const { approval, history } = await loadApprovedMetadata(root);
  const candidate = history.candidate;
  if (
    candidate.status !== 'approved' ||
    candidate.verifiedSourceCommit !== approval.verifiedSourceCommit ||
    candidate.canonicalDistSha256 !== approval.canonicalDistSha256 ||
    candidate.courseManifestSha256 !== approval.courseManifestSha256 ||
    candidate.publicProvenanceSha256 !== approval.publicProvenanceSha256
  ) {
    throw new Error('Release History candidateとRelease approvalが一致しません');
  }

  await verifyApprovedQualityEvidence(root, approval);

  return {
    verifiedSourceCommit: approval.verifiedSourceCommit,
    candidateTreeSha256: approval.candidateTreeSha256,
    canonicalDistSha256: approval.canonicalDistSha256,
    courseManifestSha256: approval.courseManifestSha256,
    publicProvenanceSha256: approval.publicProvenanceSha256,
    revision: candidate.revision,
  };
}

/** Production Artifactの実測hashをapprovalへ結び付ける。 */
export async function verifyReleaseArtifactApproval(
  repositoryRoot: string,
  supplied?: Partial<ArtifactHashes>,
): Promise<ArtifactHashes> {
  const root = path.resolve(repositoryRoot);
  const { approval } = await loadApprovedMetadata(root);
  const actual = await calculateArtifactHashes(root);
  if (supplied !== undefined) {
    for (const name of [
      'artifactDigest',
      'courseHash',
      'provenanceHash',
      'visualBaselineHash',
    ] as const) {
      const value = supplied[name];
      if (value === undefined) continue;
      assertDigestMatch(`actual-output ${name}`, actual[name], value);
    }
  }
  assertDigestMatch('canonical dist', actual.artifactDigest, approval.canonicalDistSha256);
  assertDigestMatch('Course Manifest', actual.courseHash, approval.courseManifestSha256);
  assertDigestMatch('Public Provenance', actual.provenanceHash, approval.publicProvenanceSha256);
  assertDigestMatch('Visual baseline', actual.visualBaselineHash, approval.visualBaselineSha256);
  return actual;
}

/** key=value outputを改行なしのallowlist値として書き出す。 */
async function writeGithubOutput(filePath: string, result: SourceApprovalResult): Promise<void> {
  const values = {
    verified_source_commit: result.verifiedSourceCommit,
    candidate_tree_sha256: result.candidateTreeSha256,
    canonical_dist_sha256: result.canonicalDistSha256,
    course_manifest_sha256: result.courseManifestSha256,
    public_provenance_sha256: result.publicProvenanceSha256,
    revision: result.revision,
  };
  if (Object.values(values).some((value) => /[\r\n]/u.test(value))) {
    throw new Error('GitHub outputへ改行を含む値は書けません');
  }
  await writeFile(
    filePath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  );
}

/** release:reportのkey=value Artifact hashをstrictに読む。 */
async function readActualOutput(filePath: string): Promise<Partial<ArtifactHashes>> {
  const pairs = Object.fromEntries(
    (await readFile(filePath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator <= 0) throw new Error('actual-outputの形式が不正です');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  return {
    ...(pairs.artifact_digest === undefined
      ? {}
      : { artifactDigest: Sha256Schema.parse(pairs.artifact_digest) }),
    ...(pairs.course_hash === undefined
      ? {}
      : { courseHash: Sha256Schema.parse(pairs.course_hash) }),
    ...(pairs.provenance_hash === undefined
      ? {}
      : { provenanceHash: Sha256Schema.parse(pairs.provenance_hash) }),
    ...(pairs.visual_baseline_hash === undefined
      ? {}
      : { visualBaselineHash: Sha256Schema.parse(pairs.visual_baseline_hash) }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arguments_ = process.argv.slice(2);
  const sourceOnly = arguments_.includes('--source-only');
  const artifact = arguments_.includes('--artifact');
  if (sourceOnly === artifact)
    throw new Error('--source-onlyまたは--artifactを1件指定してください');
  if (sourceOnly) {
    const result = await verifyReleaseSourceApproval(process.cwd());
    const githubOutput = argumentValue(arguments_, '--github-output');
    if (githubOutput !== undefined) await writeGithubOutput(githubOutput, result);
    console.log(`Release source approval OK: ${result.verifiedSourceCommit}`);
  } else {
    const actualOutput = argumentValue(arguments_, '--actual-output');
    const result = await verifyReleaseArtifactApproval(
      process.cwd(),
      actualOutput === undefined ? undefined : await readActualOutput(actualOutput),
    );
    console.log(`Release artifact approval OK: ${result.artifactDigest}`);
  }
}
