import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { compileContent } from '../../content/compile';
import { parseActualDeployment, parseLegacyBinding, matchPublicTree } from './baseline';
import { BaselineSchema } from './content';
import { BuildIdentitySchema, CommitSchema } from './schema';
import { buildInventory } from './inventory';
import { hashBytes, hashValue, repositoryEnvironment } from './identity';
import { AppRecordSchema, parseAppBinding } from './appRecord';
import { PREDEPLOY_FAILURE_ID, recoverKnownPredeployParent } from './predeployFailure';

const exec = promisify(execFile);
export interface CaptureOptions {
  readonly root: string;
  readonly repository: string;
  readonly siteUrl: string;
  readonly readJson?: (url: string) => Promise<unknown>;
  readonly readPublicFile?: (relative: string) => Promise<Uint8Array>;
}

/** Do not begin another attempt while the previous response is still cancelling. */
async function cancelBeforeDeadline(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const cancellation = body.cancel();
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    // Promise.race observes late cancellation rejections after a deadline failure too.
    await Promise.race([cancellation, deadline]);
    if (signal.aborted) throw signal.reason;
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/** Retry only bounded, transient delivery statuses; no failed response body becomes evidence. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const signal = AbortSignal.timeout(15000);
    const response = await fetch(url, {
      redirect: 'error',
      signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) {
      if ([502, 503, 504].includes(response.status) && attempt < 3) {
        if (response.body) await cancelBeforeDeadline(response.body, signal);
        await pause(attempt * 100);
        continue;
      }
      throw new Error('Public baseline request failed: ' + String(response.status));
    }
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const limit = 16 * 1024 * 1024;
    let buffer = new Uint8Array(0);
    let size = 0;
    let completed = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const nextSize = size + value.byteLength;
        if (nextSize > limit)
          throw new Error('Public baseline response exceeds its limit');
        if (nextSize > buffer.byteLength) {
          const capacity = Math.min(limit, Math.max(nextSize, buffer.byteLength * 2, 1024));
          const expanded = new Uint8Array(capacity);
          expanded.set(buffer.subarray(0, size));
          buffer = expanded;
        }
        buffer.set(value, size);
        size = nextSize;
      }
      completed = true;
      return buffer.byteLength === size ? buffer : buffer.slice(0, size);
    } finally {
      if (!completed) {
        // Cancellation is best effort and must not replace the original failure or hang it.
        try {
          void reader.cancel().catch(() => {});
        } catch {
          // A broken stream must not hide the failure that stopped the read.
        }
      }
      reader.releaseLock();
    }
  }
  throw new Error('Public baseline attempt limit reached');
}

/** Capture the deployed source, never the mutable current candidate. No raw learner evidence is read. */
export async function captureBaseline(options: CaptureOptions) {
  const repository = BuildIdentitySchema.shape.repository.parse(options.repository);
  const readJson =
    options.readJson ??
    (async (url: string): Promise<unknown> =>
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(await fetchBytes(url)),
      ) as unknown);
  const api = 'https://api.github.com/repos/' + repository;
  const deployments = z
    .array(z.unknown())
    .min(1)
    .parse(await readJson(api + '/deployments?environment=github-pages&per_page=1'));
  const latest = z.object({ id: z.number().int().positive() }).parse(deployments[0]);
  const first =
    latest.id === PREDEPLOY_FAILURE_ID
      ? await recoverKnownPredeployParent(repository, deployments[0], readJson)
      : deployments[0];
  const firstId = z.object({ id: z.number().int().positive() }).parse(first).id;
  const statuses = z
    .array(z.unknown())
    .min(1)
    .parse(await readJson(api + '/deployments/' + String(firstId) + '/statuses'));
  const actual = parseActualDeployment(first, statuses[0], repository, options.siteUrl);
  const gitEnvironment = await repositoryEnvironment(options.root);
  const git = async (...args: string[]) =>
    (
      await exec('git', args, { cwd: options.root, encoding: 'utf8', env: gitEnvironment })
    ).stdout.trim();
  const tags = (
    await git(
      'for-each-ref',
      '--format=%(refname)',
      'refs/tags/tsumucode-release-*',
      'refs/tags/tsumucode-app-*',
    )
  )
    .split('\n')
    .filter(Boolean);
  const matches = [];
  for (const tag of tags) {
    if ((await git('cat-file', '-t', tag)) !== 'tag') continue;
    const object = (
        await exec('git', ['cat-file', '-p', tag], {
          cwd: options.root,
          encoding: 'utf8',
          env: gitEnvironment,
        })
      ).stdout,
      message = object.slice(object.indexOf('\n\n') + 2);
    let binding;
    const source = CommitSchema.parse(await git('rev-parse', tag + '^{}'));
    if (tag.startsWith('refs/tags/tsumucode-app-')) {
      const record = AppRecordSchema.parse(JSON.parse(message) as unknown);
      if (
        record.workflowHeadCommit !== actual.workflowHeadCommit ||
        record.candidate.runId !== actual.runId ||
        record.deploymentId !== actual.deploymentId ||
        record.state !== 'verified'
      )
        continue;
      binding = parseAppBinding(message, source, { ...actual, repository });
    } else {
      if (
        !message.split(/\s+/u).includes('head=' + actual.workflowHeadCommit) ||
        !message.split(/\s+/u).some((token) => token.startsWith('workflow=' + actual.runId + '-'))
      )
        continue;
      binding = parseLegacyBinding(message, source, actual.workflowHeadCommit, actual.runId);
    }
    if (new URL(binding.pageUrl).href !== actual.siteUrl)
      throw new Error('Historical tag URL differs from actual deployment');
    matches.push({ tag, binding, tagDigest: hashBytes(object) });
  }
  if (matches.length !== 1)
    throw new Error('Current deployment has no unique verified source record');
  const original = matches[0]!;
  await git('merge-base', '--is-ancestor', original.binding.sourceCommit, 'HEAD');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'release-baseline-source-'));
  try {
    const archive = await exec(
      'git',
      ['archive', '--format=tar', original.binding.sourceCommit, 'content'],
      { cwd: options.root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, env: gitEnvironment },
    );
    const archivePath = path.join(temporary, 'source.tar');
    await writeFile(archivePath, archive.stdout, { flag: 'wx', mode: 0o600 });
    await exec('tar', ['-xf', archivePath, '-C', temporary]);
    const output = path.join(temporary, 'generated/content');
    const compilation = await compileContent({
      sourceRoot: path.join(temporary, 'content'),
      outputRoot: output,
      checkOnly: false,
      historicalSource: true,
    });
    const inventory = buildInventory(compilation.compilations);
    const publicContent = await matchPublicTree(
      output,
      options.readPublicFile ??
        (async (relative) =>
          fetchBytes(new URL('generated/content/' + relative, actual.siteUrl).href)),
    );
    if (
      (original.binding.inventoryDigest !== undefined &&
        original.binding.inventoryDigest !== hashValue(inventory)) ||
      (original.binding.publicContentDigest !== undefined &&
        original.binding.publicContentDigest !== publicContent.digest)
    )
      throw new Error('Current source or public content differs from its app record');
    const proof = {
      schemaVersion: 1,
      repository,
      deploymentId: actual.deploymentId,
      sourceCommit: original.binding.sourceCommit,
      workflowHeadCommit: actual.workflowHeadCommit,
      runId: actual.runId,
      tag: original.tag,
      tagDigest: original.tagDigest,
      artifactDigest: original.binding.artifactDigest,
      artifactDigestFormat: original.binding.artifactDigestFormat,
      projection: original.binding.projection,
      inventoryDigest: hashValue(inventory),
      publicContentDigest: publicContent.digest,
      publicFiles: publicContent.files,
      observedAt: new Date().toISOString(),
    };
    const baseline = BaselineSchema.parse({
      deploymentId: actual.deploymentId,
      sourceCommit: original.binding.sourceCommit,
      artifactDigest: original.binding.artifactDigest,
      sourceRecordDigest: hashValue(proof),
      inventory,
    });
    return { baseline, proof };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
