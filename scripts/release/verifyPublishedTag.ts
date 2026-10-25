import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CoursePublishedRelease } from './javascriptReleaseSchema';

const execFileAsync = promisify(execFile);

/** annotated tag messageの公開台帳bindingをkey単位で完全一致検証する。 */
export function assertPublishedTagMessage(release: CoursePublishedRelease, message: string): void {
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
    ...('courseId' in release
      ? {
          course_id: release.courseId,
          revision: release.revision,
          draft_source: release.draftSourceCommit,
          draft_dist: release.draftCanonicalDistSha256,
          learning_input: release.normalizedLearningInputSha256,
        }
      : {}),
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

/** annotated tagの型、target、message bindingをGit object databaseで検証する。 */
export async function verifyPublishedTag(
  repositoryRoot: string,
  release: CoursePublishedRelease,
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
