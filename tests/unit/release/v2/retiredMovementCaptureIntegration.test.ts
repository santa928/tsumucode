// @vitest-environment node
import { execFile, spawnSync } from 'node:child_process';
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, it, vi } from 'vitest';
import { createRetiredCaptureTiming } from './retiredCaptureTiming';
import { compileContent } from '../../../../scripts/content/compile';
import { captureBaseline } from '../../../../scripts/release/v2/captureBaseline';
import { assertRetiredMovementParent } from '../../../../scripts/release/v2/retiredMovementFiles';
import { prepareRelease } from '../../../../scripts/release/v2/prepare';
import { hashArtifact, hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { qualifyRelease } from '../../../../scripts/release/v2/admission';
import { readVerifiedContentPolicy } from '../../../../scripts/release/v2/contentOriginals';
import { readVerifiedPythonHistoricalAcceptances } from '../../../../scripts/release/v2/pythonHistoricalAcceptance';
import { readVerifiedTailwindHistoricalAcceptance } from '../../../../scripts/release/v2/tailwindHistoricalAcceptance';
import { readBoundedRegularFile } from '../../../../scripts/release/v2/boundedFile';

const exec = promisify(execFile);
const b930 = 'b9306eb3414e69a2068603cfdbf2706ebe4e9284';

async function sourceSelection(source: string, input: NodeJS.ProcessEnv) {
  const sourceMetadata = await lstat(path.join(source, '.git'));
  if (
    sourceMetadata.isSymbolicLink() ||
    (!sourceMetadata.isFile() && !sourceMetadata.isDirectory())
  )
    throw Error('Unsupported source Git metadata');
  if (!sourceMetadata.isFile() || (!input.GIT_DIR && !input.GIT_WORK_TREE))
    return { locator: source, selectors: {} };
  const pointer = (await readBoundedRegularFile(path.join(source, '.git'), 4096)).toString('utf8');
  const match = /^gitdir: \/.*\/worktrees\/([^/\r\n]+)\s*$/u.exec(pointer);
  if (!match || match[1] === '.' || match[1] === '..') throw Error('Invalid linked checkout');
  const common = path.join(source, '.git-common');
  const admin = path.join(common, 'worktrees', match[1]!);
  if (input.GIT_DIR !== admin || input.GIT_WORK_TREE !== source)
    throw Error('Unrecognized linked checkout selector');
  for (const directory of [common, path.join(common, 'worktrees'), admin]) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Unsafe Git mount');
  }
  const commondir = (await readBoundedRegularFile(path.join(admin, 'commondir'), 4096))
    .toString('utf8')
    .trim();
  if (commondir !== '../..') throw Error('Invalid Git common directory');
  return { locator: common, selectors: { GIT_DIR: admin, GIT_WORK_TREE: source } };
}

it('rejects dot selectors and an incorrect linked common directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retired-source-selector-'));
  try {
    const common = path.join(root, '.git-common');
    await mkdir(path.join(common, 'worktrees', 'valid'), { recursive: true });
    for (const name of ['.', '..']) {
      await writeFile(path.join(root, '.git'), `gitdir: /host/.git/worktrees/${name}\n`);
      await expect(
        sourceSelection(root, {
          GIT_DIR: path.join(common, 'worktrees', name),
          GIT_WORK_TREE: root,
        }),
      ).rejects.toThrow('Invalid linked checkout');
    }
    await writeFile(path.join(root, '.git'), 'gitdir: /host/.git/worktrees/valid\n');
    await writeFile(path.join(common, 'worktrees/valid/commondir'), '../other\n');
    await expect(
      sourceSelection(root, { GIT_DIR: path.join(common, 'worktrees/valid'), GIT_WORK_TREE: root }),
    ).rejects.toThrow('Invalid Git common directory');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Real code and public Source/tag, synthetic API/status and local expected bytes.
// No intended network or private originals. JS fetch is forbidden, but child
// processes are not network-sandboxed. No real parent or qualification proof.
it('links synthetic b930 capture, retirement guard, real prepare and synthetic-receipt admission', async ({
  task,
  signal,
}) => {
  const phase = createRetiredCaptureTiming(
    task.meta,
    signal,
    process.env['TSUMUCODE_RETIRE_TIMINGS'] === '1',
  );
  phase('setup');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'retired-capture-chain-'));
  const candidate = path.join(temporary, 'candidate');
  const old = path.join(temporary, 'old');
  const oldOutput = path.join(temporary, 'old-output/generated/content');
  const newOutput = path.join(temporary, 'candidate-output/generated/content');
  const source = process.cwd();
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Unexpected network'));
  const gitconfig = path.join(temporary, 'gitconfig');
  const env: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_NO_LAZY_FETCH: '1',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  let sourceSelectors: NodeJS.ProcessEnv = {};
  const git = async (cwd: string, ...args: string[]) =>
    (
      await exec('git', args, {
        cwd,
        env: cwd === source ? { ...env, ...sourceSelectors } : env,
        encoding: 'utf8',
        timeout: 30000,
      })
    ).stdout.trim();
  try {
    const selection = await sourceSelection(source, process.env);
    const sourceLocator = selection.locator;
    sourceSelectors = selection.selectors;
    await mkdir(candidate);
    await git(temporary, 'config', '--file', gitconfig, '--add', 'safe.directory', source);
    await git(
      temporary,
      'config',
      '--file',
      gitconfig,
      '--add',
      'safe.directory',
      path.join(source, '.git'),
    );
    if (sourceLocator !== source)
      await git(temporary, 'config', '--file', gitconfig, '--add', 'safe.directory', sourceLocator);
    const head = await git(source, 'rev-parse', 'HEAD');
    await git(candidate, 'init', '-b', 'main');
    // This fixed public acceptance Source is not a main ancestor; the real
    // checkout fetches all refs, including its existing public branch.
    await git(
      candidate,
      'fetch',
      '--no-tags',
      sourceLocator,
      head,
      '6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931',
      'f28f791456281c10c6422f77485136ad5573bbab',
      '4708bfd98d57a3e110813cfa1e176db7848babbe',
      '6f6b5704e00e7c188fd711757bbad631f05af2b5',
      'b34ac7c56a423942650e0d412573c28877ac5e9a',
    );
    await git(candidate, 'checkout', '--detach', head);
    const bytes = await readFile(
      path.join(source, 'tests/fixtures/release-v2/b930-public-tag.object'),
    );
    const result = spawnSync('git', ['mktag'], {
      cwd: candidate,
      env,
      input: bytes,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw Error('Synthetic public tag fixture could not be loaded');
    await git(
      candidate,
      'update-ref',
      'refs/tags/tsumucode-app-42929117936-7699435659',
      result.stdout.trim(),
    );
    await git(candidate, 'worktree', 'add', '--detach', old, b930);
    phase('fixture-compile');
    await compileContent({
      sourceRoot: path.join(old, 'content'),
      outputRoot: oldOutput,
      checkOnly: false,
      historicalSource: true,
    });
    phase('capture-before');
    const captureOptions = {
      root: candidate,
      repository: 'santa928/tsumucode',
      siteUrl: 'https://santa928.github.io/tsumucode/',
      readJson: async (url: string) => {
        if (
          url === 'https://api.github.com/repos/santa928/tsumucode/deployments/7699435659/statuses'
        )
          return [
            {
              state: 'success',
              environment_url: 'https://santa928.github.io/tsumucode/',
              log_url: 'https://github.com/santa928/tsumucode/actions/runs/42929117936/job/1',
            },
          ];
        if (
          url ===
          'https://api.github.com/repos/santa928/tsumucode/deployments?environment=github-pages&per_page=1'
        )
          return [{ id: 7699435659, sha: b930, ref: 'main', environment: 'github-pages' }];
        throw Error('Unexpected synthetic API request');
      },
      readPublicFile: async (relative: string) => readFile(path.join(oldOutput, relative)),
    };
    const captured = await captureBaseline(captureOptions);
    phase('prepare');
    expect(captured.proof.sourceCommit).toBe(b930);
    await assertRetiredMovementParent(candidate, captured);
    const snapshot = await prepareRelease(
      path.join(candidate, 'content'),
      newOutput,
      captured.baseline,
      captured.proof,
    );
    phase('historical');
    expect(snapshot.plan.parent?.deploymentId).toBe('7699435659');
    const manifests = TEST_SUITES.map(({ suite, producerJobId, project }) => {
      const exerciseIds = snapshot.plan.targets
        .filter(
          (target) =>
            target.kind === 'fixture' &&
            target.exerciseId &&
            ((target.mode === 'cpython' && suite === 'native-python-fixtures') ||
              (target.mode !== 'cpython' &&
                !(target.mode === 'local' && target.runtimeKind === 'next') &&
                suite === 'browser-chromium-1')),
        )
        .map((target) => target.exerciseId!);
      const lessonKeys = snapshot.plan.targets
        .filter(
          (target) =>
            target.kind === 'learning-engine' &&
            target.engine === project &&
            ((target.runtimeKind === 'next' && suite === 'native-learning-' + project) ||
              (target.runtimeKind !== 'next' &&
                suite === (project === 'chromium' ? 'browser-chromium-1' : 'browser-' + project))),
        )
        .map((target) => target.courseId + '/' + target.lessonId);
      return {
        suite,
        producerJobId,
        project,
        tests: [{ key: suite + '/synthetic', exerciseIds, lessonKeys }],
      };
    });
    const executionPlan = createExecutionPlan(
      snapshot.plan,
      manifests,
      hashValue(snapshot.publicContent),
    );
    const recipe = {
      sourceCommit: head,
      sourceTree: await git(candidate, 'rev-parse', 'HEAD^{tree}'),
      lockDigest: hashBytes(await readFile(path.join(candidate, 'package-lock.json'))),
      workflowDigest: hashBytes(
        await readFile(path.join(candidate, '.github/workflows/pages.yml')),
      ),
      policyDigest: 'a'.repeat(64),
      toolchain: 'synthetic',
      basePath: '/tsumucode/',
    };
    const identity = {
      schemaVersion: 1,
      repository: 'santa928/tsumucode',
      runId: '999',
      buildJobId: 'build',
      buildAttempt: 1,
      artifactId: '123',
      artifactDigest: (await hashArtifact(newOutput)).digest,
      planDigest: hashValue({ plan: snapshot.plan, executionPlan }),
      recipe,
    };
    const now = Date.now();
    const iso = (offset: number) => new Date(now + offset).toISOString();
    const receipts = executionPlan.requirements.map((requirement) => ({
      schemaVersion: 1,
      suite: requirement.suite,
      candidateDigest: hashValue(identity),
      inputDigest: requirement.inputDigest,
      recipeDigest: hashValue(recipe),
      runId: '999',
      jobId: requirement.producerJobId,
      verificationAttempt: 1,
      status: 'passed',
      targets: requirement.targets,
      startedAt: iso(-30000),
      finishedAt: iso(-20000),
      expiresAt: iso(3600000),
      reportDigest: 'b'.repeat(64),
    }));
    const contentPolicy = await readVerifiedContentPolicy(
      candidate,
      path.join(candidate, 'docs/quality/content-v2-receipts.json'),
    );
    const historicalAcceptances = [
      ...(await readVerifiedTailwindHistoricalAcceptance(candidate, snapshot.inventory)),
      ...(await readVerifiedPythonHistoricalAcceptances(candidate, snapshot.inventory)),
    ];
    phase('capture-after');
    const current = await captureBaseline(captureOptions);
    phase('admission');
    const admission = {
      inventory: snapshot.inventory,
      publicContent: snapshot.publicContent,
      plan: snapshot.plan,
      executionPlan,
      candidate: identity,
      results: receipts,
      capturedBaseline: captured,
      currentBaseline: current,
      contentReceipts: contentPolicy.receipts,
      contentWithdrawals: contentPolicy.withdrawals,
      historicalAcceptances,
      context: {
        repository: 'santa928/tsumucode',
        runId: '999',
        sourceCommit: head,
        currentMainCommit: head,
        recipe,
        eventName: 'workflow_dispatch',
        ref: 'refs/heads/main',
        attempt: 1,
        now: iso(0),
        jobs: {
          build: 'success',
          unit: 'success',
          boundary: 'success',
          python_fixtures: 'success',
          browser: 'success',
          public_boundary: 'success',
          performance: 'success',
        },
      },
    };
    expect(qualifyRelease(admission).status).toBe('qualified');
    expect(() => qualifyRelease({ ...admission, results: receipts.slice(1) })).toThrow();
    const otherRun = receipts.map((receipt, i) =>
      i === 0 ? { ...receipt, runId: '998' } : receipt,
    );
    expect(() => qualifyRelease({ ...admission, results: otherRun })).toThrow(
      'mismatched evidence',
    );
    expect(() =>
      qualifyRelease({
        ...admission,
        context: { ...admission.context, currentMainCommit: '0'.repeat(40) },
      }),
    ).toThrow('Stale source');
    const changedProof = { ...captured.proof, deploymentId: '999' };
    const changedParent = {
      proof: changedProof,
      baseline: {
        ...captured.baseline,
        deploymentId: '999',
        sourceRecordDigest: hashValue(changedProof),
      },
    };
    expect(() => qualifyRelease({ ...admission, currentBaseline: changedParent })).toThrow(
      'Actual published parent changed',
    );
    await expect(assertRetiredMovementParent(candidate, changedParent)).rejects.toThrow();
    await writeFile(
      path.join(candidate, 'docs/quality/movement-history/retirement-v1.json'),
      'changed',
    );
    await expect(assertRetiredMovementParent(candidate, captured)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
    phase('complete');
  } finally {
    network.mockRestore();
    await rm(temporary, { recursive: true, force: true });
  }
}, 120000);
