import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { verifyReleaseSourceApproval } from './verifyReleaseApproval';
import {
  CommitShaSchema,
  ReleaseHistorySchema,
  type PublishedRelease,
  type ReleaseHistory,
} from './releaseSchema';

const execFileAsync = promisify(execFile);

export type ReleaseMode = 'candidate' | 'beta' | 'rollback';

export interface ResolvedReleaseTarget {
  readonly checkoutSha: string;
  readonly verifiedSourceCommit: string;
  readonly releaseMode: ReleaseMode;
  readonly revision: string;
  readonly canonicalDistSha256: string;
  readonly courseManifestSha256: string;
  readonly publicProvenanceSha256: string;
}

/** 最新main、workflow、checkoutが同一のβSourceだけをDeploy対象へ変換する。 */
export function resolveBetaTarget(
  sourceShaInput: string,
  workflowHeadShaInput: string,
  checkoutHeadShaInput: string,
): ResolvedReleaseTarget {
  const sourceSha = CommitShaSchema.parse(sourceShaInput);
  const workflowHeadSha = CommitShaSchema.parse(workflowHeadShaInput);
  const checkoutHeadSha = CommitShaSchema.parse(checkoutHeadShaInput);
  if (sourceSha !== workflowHeadSha) {
    throw new Error('beta source SHAが最新mainのworkflow SHAと一致しません');
  }
  if (checkoutHeadSha !== workflowHeadSha) {
    throw new Error('beta checkout SHAがworkflow SHAと一致しません');
  }
  return {
    checkoutSha: sourceSha,
    verifiedSourceCommit: sourceSha,
    releaseMode: 'beta',
    revision: 'beta',
    canonicalDistSha256: '',
    courseManifestSha256: '',
    publicProvenanceSha256: '',
  };
}

/** 登録済み公開Releaseからrollback対象SHAを一意に解決する。 */
export function resolveRollbackRelease(
  history: ReleaseHistory,
  sourceSha: string,
): PublishedRelease {
  const matches = history.releases.filter(({ sourceCommit }) => sourceCommit === sourceSha);
  if (matches.length === 0) {
    throw new Error(`rollback SHAが公開台帳へ登録されていません: ${sourceSha}`);
  }
  if (matches.length > 1) throw new Error(`rollback SHAが公開台帳で重複しています: ${sourceSha}`);
  const release = matches[0];
  if (release === undefined) throw new Error(`rollback SHAを一意に解決できません: ${sourceSha}`);
  return release;
}

/** annotated tag messageの公開台帳bindingをkey単位で完全一致検証する。 */
export function assertPublishedTagMessage(release: PublishedRelease, message: string): void {
  const bindings = new Map<string, string>();
  for (const token of message.trim().split(/\s+/u)) {
    const separator = token.indexOf('=');
    if (separator <= 0 || separator === token.length - 1) {
      throw new Error(`Release tag messageのbinding形式が不正です: ${token}`);
    }
    const key = token.slice(0, separator);
    if (bindings.has(key)) {
      throw new Error(`Release tag messageのbindingが重複しています: ${key}`);
    }
    bindings.set(key, token.slice(separator + 1));
  }

  const expected = {
    source: release.sourceCommit,
    head: release.workflowHeadCommit,
    dist: release.canonicalDistSha256,
    course: release.courseManifestSha256,
    provenance: release.publicProvenanceSha256,
    quality_id: release.qualityArtifactId,
    quality_digest: release.qualityArtifactDigest,
    report_id: release.reportArtifactId,
    report_digest: release.reportArtifactDigest,
    workflow: `${release.workflowRunId}-${String(release.workflowRunAttempt)}`,
    page_url: release.pageUrl,
  };
  if (bindings.size !== Object.keys(expected).length) {
    throw new Error('Release tag messageに未知または欠落したbindingがあります');
  }
  for (const [key, value] of Object.entries(expected)) {
    if (bindings.get(key) !== value) {
      throw new Error(`Release tag messageの${key} bindingが公開台帳と一致しません`);
    }
  }
}

/** CLI flag直後の必須値を返す。 */
function requiredArgument(arguments_: readonly string[], flag: string): string {
  const index = arguments_.indexOf(flag);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag}へ値が必要です`);
  return value;
}

/** annotated tagの型、target、message bindingをGit object databaseで検証する。 */
export async function verifyPublishedTag(
  repositoryRoot: string,
  release: PublishedRelease,
): Promise<void> {
  const { stdout: typeOutput } = await execFileAsync('git', ['cat-file', '-t', release.tag], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (typeOutput.trim() !== 'tag') throw new Error(`Release tagがannotated tagではありません`);
  const { stdout: targetOutput } = await execFileAsync('git', ['rev-parse', `${release.tag}^{}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (targetOutput.trim() !== release.sourceCommit) {
    throw new Error('Release tag targetが公開台帳のsource SHAと一致しません');
  }
  const { stdout: tagObject } = await execFileAsync('git', ['cat-file', '-p', release.tag], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const messageOffset = tagObject.indexOf('\n\n');
  if (messageOffset === -1) throw new Error('Release tag objectにmessageがありません');
  assertPublishedTagMessage(release, tagObject.slice(messageOffset + 2));
}

/** candidate承認、最新mainのβ、または公開済みrollbackをcheckout可能なtargetへ解決する。 */
export async function verifyReleaseTarget(options: {
  readonly repositoryRoot: string;
  readonly mode: ReleaseMode;
  readonly sourceSha: string;
  readonly workflowHeadSha: string;
}): Promise<ResolvedReleaseTarget> {
  const root = path.resolve(options.repositoryRoot);
  const sourceSha = CommitShaSchema.parse(options.sourceSha);
  const workflowHeadSha = CommitShaSchema.parse(options.workflowHeadSha);
  const { stdout: checkoutHeadShaOutput } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (options.mode === 'beta') {
    return resolveBetaTarget(sourceSha, workflowHeadSha, checkoutHeadShaOutput.trim());
  }
  const history = ReleaseHistorySchema.parse(
    parse(await readFile(path.join(root, 'content/html-css/release-history.yaml'), 'utf8')),
  );

  if (options.mode === 'candidate') {
    const approval = await verifyReleaseSourceApproval(root);
    if (sourceSha !== approval.verifiedSourceCommit) {
      throw new Error('dispatch source SHAが承認済みcandidateと一致しません');
    }
    await execFileAsync(
      'git',
      ['merge-base', '--is-ancestor', approval.verifiedSourceCommit, workflowHeadSha],
      { cwd: root },
    );
    return {
      checkoutSha: workflowHeadSha,
      verifiedSourceCommit: approval.verifiedSourceCommit,
      releaseMode: 'candidate',
      revision: approval.revision,
      canonicalDistSha256: approval.canonicalDistSha256,
      courseManifestSha256: approval.courseManifestSha256,
      publicProvenanceSha256: approval.publicProvenanceSha256,
    };
  }

  const release = resolveRollbackRelease(history, sourceSha);
  await verifyPublishedTag(root, release);
  return {
    checkoutSha: release.sourceCommit,
    verifiedSourceCommit: release.sourceCommit,
    releaseMode: 'rollback',
    revision: release.revision,
    canonicalDistSha256: release.canonicalDistSha256,
    courseManifestSha256: release.courseManifestSha256,
    publicProvenanceSha256: release.publicProvenanceSha256,
  };
}

/** 改行を許さないallowlist済みtargetをGitHub output形式へ変換する。 */
export function serializeReleaseTargetOutput(target: ResolvedReleaseTarget): string {
  const values = {
    checkout_sha: target.checkoutSha,
    verified_source_commit: target.verifiedSourceCommit,
    release_mode: target.releaseMode,
    revision: target.revision,
    canonical_dist_sha256: target.canonicalDistSha256,
    course_manifest_sha256: target.courseManifestSha256,
    public_provenance_sha256: target.publicProvenanceSha256,
  };
  if (Object.values(values).some((value) => /[\r\n]/u.test(value))) {
    throw new Error('Release target outputへ改行を含む値は書けません');
  }
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

/** 改行を許さないallowlist済みtargetだけをGitHub outputへ書く。 */
async function writeTargetOutput(filePath: string, target: ResolvedReleaseTarget): Promise<void> {
  await writeFile(filePath, serializeReleaseTargetOutput(target));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arguments_ = process.argv.slice(2);
  const mode = requiredArgument(arguments_, '--mode');
  if (mode !== 'candidate' && mode !== 'beta' && mode !== 'rollback') {
    throw new Error('release modeが不正です');
  }
  const target = await verifyReleaseTarget({
    repositoryRoot: process.cwd(),
    mode,
    sourceSha: requiredArgument(arguments_, '--source-sha'),
    workflowHeadSha: requiredArgument(arguments_, '--workflow-head-sha'),
  });
  await writeTargetOutput(requiredArgument(arguments_, '--github-output'), target);
  console.log(`Release target OK: ${target.releaseMode}/${target.verifiedSourceCommit}`);
}
