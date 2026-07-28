import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { calculateArtifactHashes, type ArtifactHashes } from './releaseHashes';
import {
  ArtifactDigestSchema,
  CommitShaSchema,
  PageUrlSchema,
  Sha256Schema,
} from './releaseSchema';

const PositiveIntegerTextSchema = z.string().regex(/^[1-9]\d*$/u);

/** CLI flag直後の必須値を返す。 */
function requiredArgument(arguments_: readonly string[], flag: string): string {
  const index = arguments_.indexOf(flag);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag}へ値が必要です`);
  return value;
}

/** CLI flag直後の任意値を返す。 */
function optionalArgument(arguments_: readonly string[], flag: string): string | undefined {
  const index = arguments_.indexOf(flag);
  if (index === -1) return undefined;
  return requiredArgument(arguments_, flag);
}

/** Artifact hashをGitHub output互換のallowlist key=valueへ変換する。 */
export function formatArtifactHashOutput(hashes: ArtifactHashes): string {
  return `${[
    `artifact_digest=${hashes.artifactDigest}`,
    `course_hash=${hashes.courseHash}`,
    `provenance_hash=${hashes.provenanceHash}`,
    `visual_baseline_hash=${hashes.visualBaselineHash}`,
  ].join('\n')}\n`;
}

export interface ReleaseQualitySummary {
  readonly schemaVersion: 1;
  readonly verifiedSourceCommit: string;
  readonly completedAt: string;
  readonly suites: readonly {
    readonly name: string;
    readonly status: 'pass';
  }[];
}

/** 全suite通過後だけ作る機械可読Quality summaryを構築する。 */
export function buildQualitySummary(
  sourceSha: string,
  now: () => string = () => new Date().toISOString(),
): ReleaseQualitySummary {
  return {
    schemaVersion: 1,
    verifiedSourceCommit: CommitShaSchema.parse(sourceSha),
    completedAt: now(),
    suites: [
      'content-provenance',
      'independent-lesson-review',
      'content-compile',
      'release-continuity',
      'lint',
      'typecheck',
      'unit-content',
      'browser-matrix',
      'axe',
      'performance',
      'lighthouse',
      'static-artifact',
    ].map((name) => ({ name, status: 'pass' as const })),
  };
}

export interface ReleaseReportInput {
  readonly sourceSha: string;
  readonly workflowHeadSha: string;
  readonly releaseMode: string;
  readonly artifactDigest: string;
  readonly courseHash: string;
  readonly provenanceHash: string;
  readonly qualityArtifactId: string;
  readonly qualityArtifactDigest: string;
  readonly workflowRunId: string;
  readonly workflowRunAttempt: string;
  readonly pageUrl: string;
}

/** Release Reportの固定metadataだけを重複・未知keyなしで解析する。 */
export function parseReleaseReport(source: string): ReleaseReportInput {
  const metadata = new Map<string, string>();
  const pattern = /^- ([A-Za-z][A-Za-z0-9]*): (?:`([^`\r\n]+)`|(https:\/\/\S+))$/gmu;
  for (const match of source.matchAll(pattern)) {
    const key = match[1];
    const value = match[2] ?? match[3];
    if (key === undefined || value === undefined) continue;
    if (metadata.has(key)) throw new Error(`Release Report metadataが重複しています: ${key}`);
    metadata.set(key, value);
  }
  const keys = [
    'verifiedSourceCommit',
    'workflowHeadSha',
    'releaseMode',
    'canonicalDistSha256',
    'courseManifestSha256',
    'publicProvenanceSha256',
    'qualityEvidenceArtifactId',
    'qualityEvidenceArtifactDigest',
    'workflowRunId',
    'workflowRunAttempt',
    'pageUrl',
  ] as const;
  if (metadata.size !== keys.length || keys.some((key) => !metadata.has(key))) {
    throw new Error('Release Report metadataに未知または欠落したkeyがあります');
  }
  const value = (key: (typeof keys)[number]): string => {
    const resolved = metadata.get(key);
    if (resolved === undefined) throw new Error(`Release Report metadataが欠落しています: ${key}`);
    return resolved;
  };
  const input: ReleaseReportInput = {
    sourceSha: value('verifiedSourceCommit'),
    workflowHeadSha: value('workflowHeadSha'),
    releaseMode: value('releaseMode'),
    artifactDigest: value('canonicalDistSha256'),
    courseHash: value('courseManifestSha256'),
    provenanceHash: value('publicProvenanceSha256'),
    qualityArtifactId: value('qualityEvidenceArtifactId'),
    qualityArtifactDigest: value('qualityEvidenceArtifactDigest'),
    workflowRunId: value('workflowRunId'),
    workflowRunAttempt: value('workflowRunAttempt'),
    pageUrl: value('pageUrl'),
  };
  buildReleaseReport(input);
  return input;
}

/** Deploy結果と品質Artifact bindingをimmutable Markdown reportへ変換する。 */
export function buildReleaseReport(input: ReleaseReportInput): string {
  const sourceSha = CommitShaSchema.parse(input.sourceSha);
  const workflowHeadSha = CommitShaSchema.parse(input.workflowHeadSha);
  const releaseMode = z.enum(['candidate', 'beta', 'rollback']).parse(input.releaseMode);
  const artifactDigest = Sha256Schema.parse(input.artifactDigest);
  const courseHash = Sha256Schema.parse(input.courseHash);
  const provenanceHash = Sha256Schema.parse(input.provenanceHash);
  const qualityArtifactId = PositiveIntegerTextSchema.parse(input.qualityArtifactId);
  const qualityArtifactDigest = ArtifactDigestSchema.parse(input.qualityArtifactDigest);
  const workflowRunId = PositiveIntegerTextSchema.parse(input.workflowRunId);
  const workflowRunAttempt = PositiveIntegerTextSchema.parse(input.workflowRunAttempt);
  const pageUrl = PageUrlSchema.parse(input.pageUrl);

  return `# TsumuCode Release Report

- verifiedSourceCommit: \`${sourceSha}\`
- workflowHeadSha: \`${workflowHeadSha}\`
- releaseMode: \`${releaseMode}\`
- canonicalDistSha256: \`${artifactDigest}\`
- courseManifestSha256: \`${courseHash}\`
- publicProvenanceSha256: \`${provenanceHash}\`
- qualityEvidenceArtifactId: \`${qualityArtifactId}\`
- qualityEvidenceArtifactDigest: \`${qualityArtifactDigest}\`
- workflowRunId: \`${workflowRunId}\`
- workflowRunAttempt: \`${workflowRunAttempt}\`
- pageUrl: ${pageUrl}

Quality evidenceはContent provenance、独立Lesson review、Compile、Continuity、Lint、Typecheck、Unit/Content、3 Engine E2E、axe、Performance、Lighthouse、Static Artifactの全suiteが末尾まで成功した後にだけ作成されたActions artifactです。
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arguments_ = process.argv.slice(2);
  const modes = [
    arguments_.includes('--hash-only'),
    arguments_.includes('--quality-summary'),
  ].filter(Boolean).length;
  if (modes > 1) throw new Error('release report modeは1件だけ指定してください');

  if (arguments_.includes('--hash-only')) {
    const hashes = await calculateArtifactHashes(process.cwd());
    const output = formatArtifactHashOutput(hashes);
    const githubOutput = optionalArgument(arguments_, '--github-output');
    if (githubOutput !== undefined) await writeFile(githubOutput, output);
    process.stdout.write(output);
  } else if (arguments_.includes('--quality-summary')) {
    const output = path.resolve(requiredArgument(arguments_, '--output'));
    const summary = buildQualitySummary(requiredArgument(arguments_, '--source-sha'));
    await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`Release quality summary: ${output}`);
  } else {
    const output = path.resolve(requiredArgument(arguments_, '--output'));
    const report = buildReleaseReport({
      sourceSha: requiredArgument(arguments_, '--source-sha'),
      workflowHeadSha: requiredArgument(arguments_, '--workflow-head-sha'),
      releaseMode: requiredArgument(arguments_, '--release-mode'),
      artifactDigest: requiredArgument(arguments_, '--artifact-digest'),
      courseHash: requiredArgument(arguments_, '--course-hash'),
      provenanceHash: requiredArgument(arguments_, '--provenance-hash'),
      qualityArtifactId: requiredArgument(arguments_, '--quality-artifact-id'),
      qualityArtifactDigest: requiredArgument(arguments_, '--quality-artifact-digest'),
      workflowRunId: requiredArgument(arguments_, '--workflow-run-id'),
      workflowRunAttempt: requiredArgument(arguments_, '--workflow-run-attempt'),
      pageUrl: requiredArgument(arguments_, '--page-url'),
    });
    await writeFile(output, report);
    console.log(`Release report: ${output}`);
  }
}
