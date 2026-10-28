import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

const exec = promisify(execFile);
export interface CaptureOptions {
  readonly root: string;
  readonly repository: string;
  readonly siteUrl: string;
  readonly readJson?: (url: string) => Promise<unknown>;
  readonly readPublicFile?: (relative: string) => Promise<Uint8Array>;
}
async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error('Public baseline request failed: ' + String(response.status));
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 16 * 1024 * 1024)
    throw new Error('Public baseline response exceeds its limit');
  return bytes;
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
  const first = z.object({ id: z.number().int().positive() }).parse(deployments[0]);
  const statuses = z
    .array(z.unknown())
    .min(1)
    .parse(await readJson(api + '/deployments/' + String(first.id) + '/statuses'));
  const actual = parseActualDeployment(deployments[0], statuses[0], repository, options.siteUrl);
  const gitEnvironment = await repositoryEnvironment(options.root);
  const git = async (...args: string[]) =>
    (
      await exec('git', args, { cwd: options.root, encoding: 'utf8', env: gitEnvironment })
    ).stdout.trim();
  const tags = (await git('for-each-ref', '--format=%(refname)', 'refs/tags/tsumucode-release-*'))
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
    if (
      !message.split(/\s+/u).includes('head=' + actual.workflowHeadCommit) ||
      !message.split(/\s+/u).some((token) => token.startsWith('workflow=' + actual.runId + '-'))
    )
      continue;
    const source = CommitSchema.parse(await git('rev-parse', tag + '^{}'));
    const binding = parseLegacyBinding(message, source, actual.workflowHeadCommit, actual.runId);
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
      publication: original.binding.projection,
      checkOnly: false,
    });
    const inventory = buildInventory(compilation.compilations);
    const publicContent = await matchPublicTree(
      output,
      options.readPublicFile ??
        (async (relative) =>
          fetchBytes(new URL('generated/content/' + relative, actual.siteUrl).href)),
    );
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
      artifactDigestFormat: 'legacy-canonical-dist',
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
