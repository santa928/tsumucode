import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  hashDirectory,
  hashFile,
  calculateArtifactHashes,
} from '../../scripts/release/releaseHashes';

const execFileAsync = promisify(execFile);

/** 検査開始時のGit/配信Artifactと実ハーネスを固定する。後付けの現Source宣言で代用しない。 */
export async function captureReactAcceptance(harnessPath: string) {
  return {
    sourceCommit: (await execFileAsync('git', ['rev-parse', 'HEAD'])).stdout.trim(),
    canonicalDistSha256: (await calculateArtifactHashes(process.cwd(), 'dist', 'react'))
      .artifactDigest,
    applicationSourceSha256: await hashDirectory('src'),
    dependencyLockSha256: await hashFile('package-lock.json'),
    harnessSha256: await hashFile(harnessPath),
  };
}
