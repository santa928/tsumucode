import { execFile } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
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
import { Sha256Schema, CommitShaSchema } from './releaseSchema';
import {
  RELEASE_HISTORY_PATHS,
  releaseMetadataPaths,
  resolveReleaseCourseContract,
  type ReleaseCourseId,
} from './releaseCourseContracts';
import {
  parseCourseReleaseApproval,
  parseCourseReleaseHistory,
  type CourseReleaseApproval,
  type CourseReleaseHistory,
} from './javascriptReleaseSchema';

const execFileAsync = promisify(execFile);

export type ManualQualityRecordName =
  | 'contentReview'
  | 'visualReview'
  | 'accessibilityManual'
  | 'noviceObservation'
  | 'releaseChecklist';

export interface SourceApprovalResult {
  readonly courseId?: ReleaseCourseId;
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
  readonly revision?: string;
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
  courseId: ReleaseCourseId = 'html-css',
): Promise<CourseReleaseApproval & { readonly status: 'approved' }> {
  const contract = resolveReleaseCourseContract(courseId);
  const approval = parseCourseReleaseApproval(
    courseId,
    parse(await readFile(path.join(repositoryRoot, contract.approvalPath), 'utf8')),
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
  return approval as CourseReleaseApproval & { readonly status: 'approved' };
}

/** approvalとRelease Historyを読み、draftでない承認済みmetadataを返す。 */
async function loadApprovedMetadata(
  repositoryRoot: string,
  courseId: ReleaseCourseId,
): Promise<{
  readonly approval: CourseReleaseApproval & { readonly status: 'approved' };
  readonly history: CourseReleaseHistory;
}> {
  const contract = resolveReleaseCourseContract(courseId);
  const approval = await loadApprovedReleaseApproval(repositoryRoot, courseId);
  const history = parseCourseReleaseHistory(
    courseId,
    parse(await readFile(path.join(repositoryRoot, contract.historyPath), 'utf8')),
  );
  return { approval, history };
}

/** Git commit間のProduct差分が除外対象以外にないことを確認する。 */
export async function assertProductUnchanged(
  repositoryRoot: string,
  verifiedSourceCommit: string,
  workflowHead: string,
  courseId: ReleaseCourseId = 'html-css',
  revision?: string,
): Promise<void> {
  resolveReleaseCourseContract(courseId);
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
        ...(courseId !== 'html-css'
          ? releaseMetadataPaths(courseId, revision).map(
              (relative) => `:(exclude,literal)${relative}`,
            )
          : [
              ':(exclude)docs/superpowers/**',
              ':(exclude)docs/quality/**',
              ...RELEASE_HISTORY_PATHS.map((historyPath) => `:(exclude)${historyPath}`),
            ]),
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
  approval: CourseReleaseApproval & { readonly status: 'approved' },
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
  const courseId = 'courseId' in approval ? approval.courseId : 'html-css';
  if (courseId !== 'html-css' && options.revision === undefined)
    throw new Error('JS/TS品質承認には選択candidateのrevisionが必要です');
  await assertProductUnchanged(
    root,
    approval.verifiedSourceCommit,
    workflowHead,
    courseId,
    options.revision,
  );
  assertDigestMatch(
    'Release Candidate tree',
    await hashReleaseCandidateTree(
      root,
      options.candidateTreeFileOverrides,
      courseId,
      options.revision,
    ),
    approval.candidateTreeSha256,
  );
  const qualitySources = new Map<string, string>();
  const records: Readonly<Record<string, { readonly path: string; readonly sha256: string }>> =
    approval.records;
  for (const [recordName, record] of Object.entries(records)) {
    const absolute = path.resolve(root, record.path);
    if (!absolute.startsWith(`${root}${path.sep}`)) {
      throw new Error(`品質記録がRepository外を指しています: ${record.path}`);
    }
    if (record.sha256 === 'draft') throw new Error(`${recordName}のhashがdraftです`);
    if ((await realpath(absolute)) !== absolute)
      throw new Error('品質記録pathにsymlinkを含められません');
    assertDigestMatch(recordName, await hashFile(absolute), record.sha256);
    const source = await readFile(absolute, 'utf8');
    if ('courseId' in approval) qualitySources.set(recordName, source);
    else validateManualQualityRecord(recordName as ManualQualityRecordName, source);
    const bindings = recordBindings(source, path.extname(record.path));
    if (
      bindings.verifiedSourceCommit !== approval.verifiedSourceCommit ||
      bindings.canonicalDistSha256 !== approval.canonicalDistSha256
    ) {
      throw new Error(`${recordName}の内部bindingがRelease approvalと一致しません`);
    }
  }
  if ('courseId' in approval && approval.courseId === 'python-basics') {
    const { verifyPythonQualityEvidence } = await import('./verifyPythonQualityEvidence');
    await verifyPythonQualityEvidence(root, approval, qualitySources);
  } else if ('courseId' in approval && approval.courseId === 'next') {
    const { verifyNextQualityEvidence } = await import('./verifyNextQualityEvidence');
    await verifyNextQualityEvidence(root, approval, qualitySources);
  } else if ('courseId' in approval && approval.courseId === 'react') {
    const { verifyReactQualityEvidence } = await import('./verifyReactQualityEvidence');
    await verifyReactQualityEvidence(root, approval, qualitySources);
  } else if ('courseId' in approval && approval.courseId === 'typescript') {
    const { verifyTypescriptQualityEvidence } = await import('./verifyTypescriptQualityEvidence');
    await verifyTypescriptQualityEvidence(root, approval, qualitySources);
  } else if ('courseId' in approval) {
    const { verifyJavascriptQualityEvidence } = await import('./verifyJavascriptQualityEvidence');
    await verifyJavascriptQualityEvidence(root, approval, qualitySources);
  }
}

/** 手動記録、candidate tree、source commitのbindingを検証する。 */
export async function verifyReleaseSourceApproval(
  repositoryRoot: string,
  courseId: ReleaseCourseId = 'html-css',
): Promise<SourceApprovalResult> {
  const root = path.resolve(repositoryRoot);
  const { approval, history } = await loadApprovedMetadata(root, courseId);
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

  await verifyApprovedQualityEvidence(root, approval, { revision: candidate.revision });
  if ('courseId' in candidate && candidate.courseId === 'python-basics') {
    if (
      candidate.draftSourceCommit !== approval.verifiedSourceCommit ||
      candidate.draftCanonicalDistSha256 !== approval.canonicalDistSha256 ||
      candidate.normalizedLearningInputSha256 !== approval.candidateTreeSha256
    )
      throw new Error('Python初公開candidateのsource/artifact/input bindingが一致しません');
  }
  if (
    'courseId' in candidate &&
    candidate.courseId === 'next' &&
    'courseId' in approval &&
    approval.courseId === 'next'
  ) {
    const { NextReleaseEvidenceSchema } = await import('./verifyNextQualityEvidence');
    const validity = NextReleaseEvidenceSchema.parse(
      parse(await readFile(path.join(root, approval.records.technicalAcceptance.path), 'utf8')),
    );
    if (
      candidate.draftSourceCommit !== validity.draftInput.sourceCommit ||
      candidate.draftCanonicalDistSha256 !== validity.draftCanonicalDistSha256 ||
      candidate.normalizedLearningInputSha256 !== validity.draftInput.normalizedInputSha256
    )
      throw new Error('Next candidateと公開入力照合のbindingが一致しません');
  } else if (
    'courseId' in candidate &&
    candidate.courseId === 'typescript' &&
    'courseId' in approval &&
    approval.courseId === 'typescript'
  ) {
    const { TypescriptReleaseEvidenceSchema } = await import('./verifyTypescriptQualityEvidence');
    const validity = TypescriptReleaseEvidenceSchema.parse(
      parse(await readFile(path.join(root, approval.records.technicalAcceptance.path), 'utf8')),
    );
    if (
      candidate.draftSourceCommit !== validity.draftInput.sourceCommit ||
      candidate.draftCanonicalDistSha256 !== validity.draftCanonicalDistSha256 ||
      candidate.normalizedLearningInputSha256 !== validity.normalizedLearningInputSha256
    )
      throw new Error('TS candidateと公開入力照合のbindingが一致しません');
  } else if (
    'courseId' in candidate &&
    candidate.courseId === 'react' &&
    'courseId' in approval &&
    approval.courseId === 'react'
  ) {
    const { ReactReleaseEvidenceSchema } = await import('./verifyReactQualityEvidence');
    const validity = ReactReleaseEvidenceSchema.parse(
      parse(await readFile(path.join(root, approval.records.technicalAcceptance.path), 'utf8')),
    );
    if (
      candidate.draftSourceCommit !== validity.draftInput.sourceCommit ||
      candidate.draftCanonicalDistSha256 !== validity.draftCanonicalDistSha256 ||
      candidate.normalizedLearningInputSha256 !== validity.draftInput.normalizedInputSha256
    )
      throw new Error('React candidateと公開入力照合のbindingが一致しません');
  } else if (
    'courseId' in candidate &&
    candidate.courseId === 'javascript' &&
    'courseId' in approval &&
    approval.courseId === 'javascript'
  ) {
    const { JavascriptInputValidityRecordSchema } = await import('./javascriptQualityRecords');
    const validity = JavascriptInputValidityRecordSchema.parse(
      parse(await readFile(path.join(root, approval.records.inputValidity.path), 'utf8')),
    );
    if (
      candidate.draftSourceCommit === 'draft' ||
      candidate.draftCanonicalDistSha256 === 'draft' ||
      candidate.normalizedLearningInputSha256 === 'draft' ||
      candidate.draftSourceCommit !== validity.draftInput.sourceCommit ||
      candidate.draftCanonicalDistSha256 !== validity.draftCanonicalDistSha256 ||
      candidate.normalizedLearningInputSha256 !== validity.draftInput.normalizedInputSha256
    ) {
      throw new Error('candidateの公開入力監査bindingがinput validityと一致しません');
    }
  }

  return {
    courseId,
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
  courseId: ReleaseCourseId = 'html-css',
): Promise<ArtifactHashes> {
  const root = path.resolve(repositoryRoot);
  const { approval } = await loadApprovedMetadata(root, courseId);
  const actual = await calculateArtifactHashes(root, 'dist', courseId);
  if (courseId === 'typescript') {
    const { measureTypescriptLazyJavaScript } = await import('./verifyTypescriptAcceptance');
    const bytes = await measureTypescriptLazyJavaScript(path.join(root, 'dist'));
    if (bytes > 2_500_000) throw new Error('TS初回遅延JSの公開予算を超過しています');
  }
  if (courseId !== 'html-css' && supplied !== undefined && supplied.courseId !== courseId) {
    throw new Error('JS/TS actual-outputへ一致するcourse_idが必要です');
  }
  if (supplied?.courseId !== undefined && supplied.courseId !== courseId)
    throw new Error('actual-outputのCourseが異なります');
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
    course_id: result.courseId ?? 'html-css',
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
  const seen = new Set<string>();
  const allowed = new Set([
    'artifact_digest',
    'course_hash',
    'provenance_hash',
    'visual_baseline_hash',
    'course_id',
  ]);
  const pairs = Object.fromEntries(
    (await readFile(filePath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator <= 0) throw new Error('actual-outputの形式が不正です');
        const key = line.slice(0, separator);
        if (!allowed.has(key) || seen.has(key))
          throw new Error('actual-outputの未知/重複keyを拒否します');
        seen.add(key);
        return [key, line.slice(separator + 1)];
      }),
  );
  if (
    !['artifact_digest', 'course_hash', 'provenance_hash', 'visual_baseline_hash'].every((key) =>
      seen.has(key),
    )
  ) {
    throw new Error('actual-outputに必須Artifact hashがありません');
  }
  return {
    ...(pairs.course_id === undefined
      ? {}
      : { courseId: resolveReleaseCourseContract(pairs.course_id).courseId }),
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
  const courseId = resolveReleaseCourseContract(argumentValue(arguments_, '--course-id')).courseId;
  const sourceOnly = arguments_.includes('--source-only');
  const artifact = arguments_.includes('--artifact');
  const productOnly = arguments_.includes('--product-only');
  if ([sourceOnly, artifact, productOnly].filter(Boolean).length !== 1)
    throw new Error('--source-only/--artifact/--product-onlyを1件指定してください');
  if (productOnly) {
    const verifiedSource = CommitShaSchema.parse(
      argumentValue(arguments_, '--verified-source-sha'),
    );
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    await assertProductUnchanged(
      process.cwd(),
      verifiedSource,
      stdout.trim(),
      courseId,
      argumentValue(arguments_, '--revision'),
    );
    console.log(`Release Product unchanged: ${verifiedSource}`);
  } else if (sourceOnly) {
    const result = await verifyReleaseSourceApproval(process.cwd(), courseId);
    const githubOutput = argumentValue(arguments_, '--github-output');
    if (githubOutput !== undefined) await writeGithubOutput(githubOutput, result);
    console.log(`Release source approval OK: ${result.verifiedSourceCommit}`);
  } else {
    const actualOutput = argumentValue(arguments_, '--actual-output');
    const result = await verifyReleaseArtifactApproval(
      process.cwd(),
      actualOutput === undefined ? undefined : await readActualOutput(actualOutput),
      courseId,
    );
    console.log(`Release artifact approval OK: ${result.artifactDigest}`);
  }
}
