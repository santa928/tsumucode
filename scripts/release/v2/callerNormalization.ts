import { parseDocument } from 'yaml';
import { z } from 'zod';
import { hashBytes } from './identity';

const SIGNER = 'santa928/tsumucode/.github/workflows/release-v2-lineage-sign.yml@';
const PLACEHOLDER = '<FIXED_SIGNER_COMMIT>';

/** Normalization only: this does not approve workflow content, signer or dependencies. */
export function normalizedCallerDigest(bytes: Uint8Array, signerCommit: string): string {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 512 * 1024)
    throw new Error('Invalid caller workflow bytes');
  if (!/^[a-f0-9]{40}$/u.test(signerCommit)) throw new Error('Invalid signer commit');
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (source.includes('\r') || source.includes('\uFEFF') || source.split(SIGNER).length !== 2)
    throw new Error('Caller signer reference is missing or ambiguous');
  const line = source.split('\n').find((row) => row.includes(SIGNER));
  if (!line || !/^[ \t]*uses:[ \t]+\S+[ \t]*$/u.test(line) ||
      line.trim() !== `uses: ${SIGNER}${signerCommit}`)
    throw new Error('Caller signer reference differs');
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error('Invalid caller YAML');
  const root = z.object({ jobs: z.record(z.string(), z.unknown()) }).loose().parse(
    document.toJS({ maxAliasCount: 0 }),
  );
  const matchingJobs = Object.values(root.jobs).filter((job) =>
    job !== null && typeof job === 'object' && !Array.isArray(job) &&
    (job as Record<string, unknown>).uses === SIGNER + signerCommit,
  );
  if (matchingJobs.length !== 1) throw new Error('Caller signer job is missing or ambiguous');
  return hashBytes(source.replace(SIGNER + signerCommit, SIGNER + PLACEHOLDER));
}
