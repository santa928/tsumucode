import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import { hashBytes, hashValue } from './identity';
import {
  assertSafeAnchorEnvironment,
  assertVisibleAnchorIndex,
  isolatedAnchorGitEnvironment,
} from './anchorProcessSafety';
import { assertAnchorTrackedTree } from './anchorTrackedTree';
import { validateCapturedBaseline } from './parent';
import type { verifyPythonFirstAnchor } from './pythonFirstAnchorVerifier';
import { CommitSchema } from './schema';

const exec = promisify(execFile);
// Experimental pin only: the corresponding PR must pass CI and review before integration.
const verifierCommit = '28edb392dccfaecd14c5b5b03470198abd8ec421';
const anchorDeclaration = '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494';
const anchorSource = 'b9306eb3414e69a2068603cfdbf2706ebe4e9284';
const anchorTagDigest = '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b';
const decimalId = z.string().regex(/^[1-9]\d{0,15}$/u);

/** These are claims until an independently trusted workflow binds them to GitHub's own context. */
const RunContext = z
  .object({
    repository: z.literal('santa928/tsumucode'),
    source: CommitSchema,
    runId: decimalId,
    attempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    producerJob: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,99}$/u),
    producerJobId: decimalId,
    eventName: z.literal('workflow_dispatch'),
    ref: z.literal('refs/heads/main'),
  })
  .strict();

async function cleanHead(root: string, allowUntracked: boolean) {
  const env = isolatedAnchorGitEnvironment();
  const options = {
    cwd: root,
    env,
    encoding: 'utf8' as const,
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
  };
  const head = CommitSchema.parse(
    (await exec('/usr/bin/git', ['rev-parse', '--verify', 'HEAD'], options)).stdout.trim(),
  );
  const index = await exec('/usr/bin/git', ['ls-files', '-v', '-z'], options);
  assertVisibleAnchorIndex(index.stdout);
  const status = await exec(
    '/usr/bin/git',
    [
      '-c',
      'core.fsmonitor=false',
      'status',
      '--porcelain=v1',
      '-z',
      allowUntracked ? '--untracked-files=no' : '--untracked-files=all',
    ],
    options,
  );
  if (status.stdout) throw Error('Anchor checkout is not clean');
  return head;
}

/**
 * Construct bounded same-run evidence after the existing read-only verifier succeeds.
 *
 * This does not authenticate workflow claims, GitHub needs, the artifact producer, or grant
 * release permission. A reviewed workflow must pin and isolate this code and its dependencies,
 * authenticate the context and immutable artifact, then recheck the live parent before admission.
 * The baseline is checked in memory and is not returned. Its observation time changes on
 * recapture; consumers must independently validate a fresh baseline and compare parent identity.
 */
export async function producePythonFirstAnchor(
  candidatePath: string,
  verifierPath: string,
  contextInput: unknown,
) {
  assertSafeAnchorEnvironment(process.env);
  const context = RunContext.parse(contextInput);
  if (!path.isAbsolute(candidatePath) || !path.isAbsolute(verifierPath))
    throw Error('Anchor checkouts must be absolute');
  const candidate = await realpath(candidatePath);
  const verifier = await realpath(verifierPath);
  if (candidate === verifier) throw Error('Candidate and verifier checkouts must be separate');
  if ((await cleanHead(verifier, true)) !== verifierCommit) throw Error('Verifier commit differs');
  if ((await cleanHead(candidate, false)) !== context.source)
    throw Error('Candidate source differs');
  await assertAnchorTrackedTree(verifier, verifierCommit);
  const moduleUrl = pathToFileURL(
    path.join(verifier, 'scripts/release/v2/pythonFirstAnchorVerifier.ts'),
  );
  const implementation = (await import(/* @vite-ignore */ moduleUrl.href)) as {
    verifyPythonFirstAnchor: typeof verifyPythonFirstAnchor;
  };
  const observation = await implementation.verifyPythonFirstAnchor(candidate);
  const baselineBytes = Buffer.from(observation.snapshot, 'utf8');
  if (
    !baselineBytes.length ||
    baselineBytes.length > 4 * 1024 * 1024 ||
    hashBytes(baselineBytes) !== observation.sha256
  )
    throw Error('Anchor baseline bytes differ');
  const captured = validateCapturedBaseline(JSON.parse(observation.snapshot) as unknown);
  if (
    canonicalJson(captured) !== observation.snapshot ||
    observation.declarationDigest !== anchorDeclaration ||
    captured.proof.repository !== context.repository ||
    captured.proof.deploymentId !== '7699435659' ||
    captured.proof.sourceCommit !== anchorSource ||
    captured.proof.workflowHeadCommit !== anchorSource ||
    captured.proof.tagDigest !== anchorTagDigest
  )
    throw Error('Anchor baseline identity differs');
  if (
    (await cleanHead(verifier, true)) !== verifierCommit ||
    (await cleanHead(candidate, false)) !== context.source
  )
    throw Error('Anchor checkout changed during observation');
  const evidenceBytes = Buffer.from(
    canonicalJson({
      schemaVersion: 1,
      mode: 'anchor',
      repository: context.repository,
      source: context.source,
      runId: context.runId,
      attempt: context.attempt,
      producerJobId: context.producerJobId,
      verifierCommit,
      parentDeploymentId: captured.proof.deploymentId,
      parentSource: captured.proof.sourceCommit,
      parentTagDigest: captured.proof.tagDigest,
      parentIdentityDigest: hashValue({ ...captured.proof, observedAt: null }),
      movementDeclarationDigest: observation.declarationDigest,
    }),
    'utf8',
  );
  if (evidenceBytes.length > 16 * 1024) throw Error('Anchor evidence exceeds limit');
  return { evidenceBytes, evidenceSha256: hashBytes(evidenceBytes) };
}
