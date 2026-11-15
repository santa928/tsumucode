import { z } from 'zod';

const positive = z.string().regex(/^[1-9]\d{0,15}$/u);
const sourceCommit = z.string().regex(/^[a-f0-9]{40}$/u);
const MetadataSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().max(200),
  size_in_bytes: z.number().int().positive(),
  expired: z.literal(false),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  workflow_run: z.object({
    id: z.number().int().positive(),
    repository_id: z.literal(1303564490),
    head_repository_id: z.literal(1303564490),
    head_branch: z.literal('main'),
    head_sha: sourceCommit,
  }),
});
const PredeployInputSchema = z
  .object({
    runId: positive,
    source: sourceCommit,
    attempt: positive,
    candidateId: positive,
    metadataId: positive,
    qualificationId: positive,
  })
  .strict();
const InputSchema = PredeployInputSchema.extend({ reportId: positive }).strict();

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch {
    throw Error('Invalid artifact metadata context');
  }
}

/** GitHub metadata corroboration only; this does not establish the producer job or authorize signing. */
export async function inspectSameRunArtifactMetadata(input: unknown, token: string) {
  const wanted = parseInput(InputSchema, input);
  const entries = [
    ['candidate', wanted.candidateId, 1024 * 1024 * 1024],
    ['candidate-metadata', wanted.metadataId, 64 * 1024 * 1024],
    ['qualification', wanted.qualificationId, 4 * 1024 * 1024],
    ['public-report', wanted.reportId, 16 * 1024 * 1024],
  ] as const;
  return inspectArtifacts(wanted, entries, token);
}

/** Pre-deploy metadata only; producer authority, qualification bytes and freshness are not established here. */
export async function inspectPredeployArtifactMetadata(input: unknown, token: string) {
  const wanted = parseInput(PredeployInputSchema, input);
  const entries = [
    ['candidate', wanted.candidateId, 1024 * 1024 * 1024],
    ['candidate-metadata', wanted.metadataId, 64 * 1024 * 1024],
    ['qualification', wanted.qualificationId, 4 * 1024 * 1024],
  ] as const;
  const result = await inspectArtifacts(wanted, entries, token);
  if (result.some((artifact) => artifact.attempt !== wanted.attempt))
    throw Error('Predeploy artifact attempt differs');
  return result;
}

async function inspectArtifacts(
  wanted: z.infer<typeof PredeployInputSchema>,
  entries: readonly (readonly [string, string, number])[],
  token: string,
) {
  if (!token || token.length > 8192 || /[\r\n]/u.test(token))
    throw Error('Missing artifact read token');
  if (new Set(entries.map((entry) => entry[1])).size !== entries.length)
    throw Error('Artifact IDs collide');
  const attemptLimit = BigInt(wanted.attempt);
  const result: { name: string; id: string; digest: string; attempt: string }[] = [];
  for (const [kind, id, maxSize] of entries) {
    const bytes = await readArtifactMetadata(id, token);
    let metadata: z.infer<typeof MetadataSchema>;
    try {
      metadata = MetadataSchema.parse(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
      );
    } catch {
      // Never attach untrusted response text or parser errors as a cause.
      throw Error('Artifact metadata invalid');
    }
    const match = new RegExp(`^${kind}-${wanted.runId}-([1-9]\\d{0,15})$`, 'u').exec(metadata.name);
    if (
      !match ||
      BigInt(match[1]!) > attemptLimit ||
      String(metadata.id) !== id ||
      String(metadata.workflow_run.id) !== wanted.runId ||
      metadata.workflow_run.head_sha !== wanted.source ||
      metadata.size_in_bytes > maxSize
    )
      throw Error('Artifact metadata identity differs');
    result.push({ name: metadata.name, id, digest: metadata.digest, attempt: match[1]! });
  }
  if (result[0]?.attempt !== result[1]?.attempt) throw Error('Candidate metadata attempt differs');
  return result;
}

/** Bounded transport only; it does not authenticate provenance or authorize publication. */
async function readArtifactMetadata(id: string, token: string): Promise<Buffer> {
  const signal = AbortSignal.timeout(10000);
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(Error('Artifact metadata timed out'));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  void deadline.catch(() => {});
  const active: {
    body?: ReadableStream<Uint8Array> | null;
    reader?: ReadableStreamDefaultReader<Uint8Array>;
  } = {};
  const cancel = (stream: { cancel(): Promise<void> }) => {
    try {
      void stream.cancel().catch(() => {});
    } catch {
      /* Preserve the original failure. */
    }
  };
  const timedOut = () => {
    if (signal.aborted) throw Error('Artifact metadata timed out');
  };
  const read = async () => {
    const response = await fetch(
      `https://api.github.com/repos/santa928/tsumucode/actions/artifacts/${id}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
        redirect: 'error',
        signal,
      },
    );
    const body = response.body;
    active.body = body;
    if (signal.aborted) {
      if (body) cancel(body);
      timedOut();
    }
    if (!response.ok || !body) throw Error('Artifact metadata unavailable');
    const reader = body.getReader();
    active.reader = reader;
    const chunks: Uint8Array[] = [];
    let count = 0,
      reads = 0;
    for (;;) {
      const part = await reader.read();
      timedOut();
      if (part.done) break;
      count += part.value.byteLength;
      if (count > 64 * 1024) throw Error('Artifact metadata too large');
      if (part.value.byteLength) chunks.push(part.value);
      if (++reads % 256 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        timedOut();
      }
    }
    return Buffer.concat(chunks);
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
        /* Preserve the original failure. */
      }
    } else if (active.body) cancel(active.body);
    let message = 'Artifact metadata unavailable';
    try {
      if (
        error instanceof Error &&
        ['Artifact metadata timed out', 'Artifact metadata too large'].includes(error.message)
      )
        message = error.message;
    } catch {
      /* Never expose network or stream error properties. */
    }
    // This candidate is unconnected; no error is an authorization decision.
    // eslint-disable-next-line preserve-caught-error -- Network errors may contain sensitive values.
    throw Error(message);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
