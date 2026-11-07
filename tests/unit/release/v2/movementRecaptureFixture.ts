import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { compileContent } from '../../../../scripts/content/compile';
import {
  captureBaseline,
  type CaptureOptions,
} from '../../../../scripts/release/v2/captureBaseline';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { learnerCarryFixture, sealLearnerFixture } from './learnerCarryFixture';
import { releaseFixture } from './releaseFixture';

const exec = promisify(execFile);
export const ORIGINAL_CAPTURE_TIME = '2026-11-04T15:00:00.000Z';
export const FRESH_CAPTURE_TIME = '2026-11-05T01:00:00.000Z';

/** 実capture関数をtemp Git/ローカルpublic bytes/API fixtureで通す。外部deployment認証ではない。 */
export async function captureAtTwoTimes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movement-recapture-'));
  try {
    await cp('tests/fixtures/foundation-content', path.join(root, 'content'), { recursive: true });
    const git = async (...args: string[]) =>
      (
        await exec('git', args, {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_DIR: undefined,
            GIT_WORK_TREE: undefined,
            GIT_COMMON_DIR: undefined,
            GIT_INDEX_FILE: undefined,
            GIT_OBJECT_DIRECTORY: undefined,
            GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
          },
        })
      ).stdout.trim();
    await git('init', '-b', 'main');
    await git('add', 'content');
    await git(
      '-c',
      'user.name=Unit Fixture',
      '-c',
      'user.email=unit@example.invalid',
      'commit',
      '-m',
      'synthetic recapture source',
    );
    const source = await git('rev-parse', 'HEAD');
    await git(
      '-c',
      'user.name=Unit Fixture',
      '-c',
      'user.email=unit@example.invalid',
      'tag',
      '-a',
      'tsumucode-release-recapture-unit',
      '-m',
      `source=${source} head=${source} dist=${'a'.repeat(64)} workflow=101-1 page_url=https://owner.github.io/site/`,
      source,
    );
    const output = path.join(root, 'public/generated/content');
    await compileContent({
      sourceRoot: path.join(root, 'content'),
      outputRoot: output,
      checkOnly: false,
    });
    const options: CaptureOptions = {
      root,
      repository: 'owner/site',
      siteUrl: 'https://owner.github.io/site/',
      readJson: async (url) =>
        url.endsWith('/statuses')
          ? [
              {
                state: 'success',
                environment_url: 'https://owner.github.io/site/',
                log_url: 'https://github.com/owner/site/actions/runs/101/job/201',
              },
            ]
          : [{ id: 501, sha: source, ref: 'main', environment: 'github-pages' }],
      readPublicFile: async (relative) => readFile(path.join(output, relative)),
    };
    // Dateだけを制御。Git/FS/Compilerの非同期timerや製品の時間制限には触れない。
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ORIGINAL_CAPTURE_TIME));
    const original = await captureBaseline(options);
    vi.setSystemTime(new Date(FRESH_CAPTURE_TIME));
    const current = await captureBaseline(options);
    return { original, current };
  } finally {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  }
}

/** movement用は別の合成2Course protocol。上のfoundation Gitを2Courseの実原本とは扱わない。 */
export async function movementRecaptureFixture() {
  const bound = await learnerCarryFixture();
  const original = {
    ...releaseFixture().capturedBaseline.proof,
    deploymentId: bound.baseline.deploymentId,
    sourceCommit: bound.baseline.sourceCommit,
    artifactDigest: bound.baseline.artifactDigest,
    inventoryDigest: hashValue(bound.baseline.inventory),
    observedAt: ORIGINAL_CAPTURE_TIME,
  };
  bound.baseline.sourceRecordDigest = hashValue(original);
  bound.inputs.declaration.body.baseline.sourceRecordDigest = bound.baseline.sourceRecordDigest;
  sealLearnerFixture(bound);
  const current = { ...original, observedAt: FRESH_CAPTURE_TIME };
  return {
    bound,
    inputs: { ...structuredClone(bound.inputs), baselineProofs: { original, current } },
    freshBaseline: { ...structuredClone(bound.baseline), sourceRecordDigest: hashValue(current) },
  };
}
