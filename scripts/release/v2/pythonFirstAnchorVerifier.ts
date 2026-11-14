import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import { parseActualDeployment } from './baseline';
import { readBoundedRegularFile } from './boundedFile';
import { captureBaseline } from './captureBaseline';
import { hashBytes, hashValue, repositoryEnvironment } from './identity';
import { MovementDeclarationSchema } from './movement';
import { validateCapturedBaseline } from './parent';
import { assertFixedPythonFirstAnchor } from './pythonFirstAnchorIdentity';
import { PREDEPLOY_FAILURE_ID, recoverKnownPredeployParent } from './predeployFailure';

const exec = promisify(execFile);
const repository = 'santa928/tsumucode',
  siteUrl = 'https://santa928.github.io/tsumucode/';
const tagName = 'tsumucode-app-42929117936-7699435659';
const tagObject = 'fa87f692442cb3876b07ef33e583e29b438dae31';
const declarationDigest = '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494';
const summaryDigest = '6846fc995075bcc5d19ff3b2ef10bab487aed4c75701d8e3d8f1d2e392f42674';

async function readPublicJson(url: string): Promise<unknown> {
  const signal = AbortSignal.timeout(15000);
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(new Error('Public anchor observation timed out'));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  // The signal can already be aborted before a race can attach its handler.
  void deadline.catch(() => {});
  const active: {
    reader?: ReadableStreamDefaultReader<Uint8Array>;
    body?: ReadableStream<Uint8Array> | null;
  } = {};
  const timedOut = () => {
    if (signal.aborted) throw Error('Public anchor observation timed out');
  };
  const cancel = (stream: { cancel(): Promise<void> }) => {
    // A rejected or never-settling cancellation cannot replace or delay a failure.
    try {
      void stream.cancel().catch(() => {});
    } catch {
      /* Preserve the original error. */
    }
  };
  const read = async (): Promise<unknown> => {
    const response = await fetch(url, {
      redirect: 'error',
      signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    const body = response.body;
    active.body = body;
    if (signal.aborted) {
      if (body) cancel(body);
      timedOut();
    }
    if (!response.ok || !body) throw Error('Public anchor observation unavailable');
    const reader = body.getReader();
    active.reader = reader;
    const limit = 1024 * 1024;
    let buffer = new Uint8Array(0),
      total = 0,
      turns = 0;
    for (;;) {
      const item = await reader.read();
      timedOut();
      if (item.done) break;
      const next = total + item.value.byteLength;
      if (next > limit) throw Error('Public anchor response exceeds limit');
      if (next > buffer.byteLength) {
        const grown = new Uint8Array(Math.min(limit, Math.max(next, buffer.byteLength * 2, 1024)));
        grown.set(buffer.subarray(0, total));
        buffer = grown;
      }
      buffer.set(item.value, total);
      total = next;
      if (++turns % 1024 === 0) {
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        timedOut();
      }
    }
    timedOut();
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total)),
    );
    timedOut();
    return value;
  };
  try {
    timedOut();
    const value = await Promise.race([read(), deadline]);
    timedOut();
    if (active.reader) {
      active.reader.releaseLock();
      delete active.reader;
    }
    return value;
  } catch (error) {
    if (active.reader) {
      cancel(active.reader);
      try {
        active.reader.releaseLock();
      } catch {
        /* Preserve the failure. */
      }
    } else if (active.body) cancel(active.body);
    let message = 'Public anchor observation failed';
    try {
      if (
        error instanceof Error &&
        [
          'Public anchor observation timed out',
          'Public anchor observation unavailable',
          'Public anchor response exceeds limit',
        ].includes(error.message)
      )
        message = error.message;
    } catch {
      /* Untrusted error properties must not escape. */
    }
    // Do not attach a potentially sensitive network error as a cause.
    // eslint-disable-next-line preserve-caught-error -- Public failures must not retain raw response errors.
    throw Error(message);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/** Read-only current anchor observation. It never qualifies, signs or publishes a candidate. */
export async function verifyPythonFirstAnchor(candidateRoot: string) {
  if (!path.isAbsolute(candidateRoot)) throw Error('Invalid candidate root');
  // The verifier must itself be checked out at an independently reviewed pinned commit.
  const summaryPath = fileURLToPath(
    new URL('../../../docs/quality/python-first-anchor-summary-v1.json', import.meta.url),
  );
  const summary = await readBoundedRegularFile(summaryPath, 16 * 1024);
  if (hashBytes(summary) !== summaryDigest) throw Error('Historical anchor summary differs');
  const declarationBytes = await readBoundedRegularFile(
    path.join(candidateRoot, 'docs/quality/movement-eb2-v2.json'),
    4 * 1024 * 1024,
  );
  const declaration = MovementDeclarationSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(declarationBytes)) as unknown,
  );
  if (
    declaration.body.stage !== 'python-first' ||
    declaration.declarationDigest !== declarationDigest ||
    declaration.bodyDigest !== hashValue(declaration.body) ||
    hashValue({
      body: declaration.body,
      bodyDigest: declaration.bodyDigest,
      approvals: declaration.approvals,
    }) !== declarationDigest
  )
    throw Error('Consumed movement declaration differs');
  const api = `https://api.github.com/repos/${repository}`;
  const checkRef = async () => {
    z.object({
      ref: z.literal(`refs/tags/${tagName}`),
      object: z.object({ type: z.literal('tag'), sha: z.literal(tagObject) }),
    }).parse(await readPublicJson(`${api}/git/ref/tags/${tagName}`));
  };
  const readActual = async () => {
    const deployments = z
      .array(z.unknown())
      .min(1)
      .parse(await readPublicJson(`${api}/deployments?environment=github-pages&per_page=1`));
    const latest = z.object({ id: z.number().int().positive() }).parse(deployments[0]);
    const parent =
      latest.id === PREDEPLOY_FAILURE_ID
        ? await recoverKnownPredeployParent(repository, deployments[0], readPublicJson)
        : deployments[0];
    const deployment = z
      .object({ id: z.number().int().positive(), created_at: z.iso.datetime() })
      .parse(parent);
    const statuses = z
      .array(z.unknown())
      .min(1)
      .parse(await readPublicJson(`${api}/deployments/${String(deployment.id)}/statuses`));
    const status = z
      .object({ id: z.number().int().positive(), created_at: z.iso.datetime() })
      .parse(statuses[0]);
    return {
      ...parseActualDeployment(parent, statuses[0], repository, siteUrl),
      createdAt: deployment.created_at,
      statusId: status.id,
      statusCreatedAt: status.created_at,
    };
  };
  await checkRef();
  const before = await readActual();
  const captured = validateCapturedBaseline(
    await captureBaseline({ root: candidateRoot, repository, siteUrl }),
  );
  const environment = {
    ...(await repositoryEnvironment(candidateRoot)),
    GIT_NO_REPLACE_OBJECTS: '1',
  };
  const tag = (
    await exec('git', ['cat-file', '-p', tagObject], {
      cwd: candidateRoot,
      env: environment,
      encoding: 'buffer',
      maxBuffer: 16 * 1024,
      timeout: 10000,
    })
  ).stdout;
  assertFixedPythonFirstAnchor(captured.proof, tag);
  const actual = await readActual();
  await checkRef();
  if (
    actual.deploymentId !== captured.proof.deploymentId ||
    actual.workflowHeadCommit !== captured.proof.workflowHeadCommit ||
    actual.runId !== captured.proof.runId ||
    new URL(actual.siteUrl).href !== new URL(siteUrl).href ||
    hashValue(actual) !== hashValue(before)
  )
    throw Error('Anchor deployment changed during observation');
  const snapshot = canonicalJson(captured);
  return { snapshot, sha256: hashBytes(Buffer.from(snapshot)), declarationDigest };
}
