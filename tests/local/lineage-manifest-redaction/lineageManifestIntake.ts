import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';

const Manifest = z
  .object({
    context: z.unknown(),
    needs: z.unknown(),
    pins: z.unknown(),
    predeployActual: z.unknown(),
    signatureContext: z.unknown().optional(),
  })
  .strict();

/** Private, bounded syntax/shape only; neither secrecy nor input provenance is established. */
export function parseProtectedNeedsManifest(input: unknown): z.infer<typeof Manifest> {
  try {
    if (
      !(input instanceof Uint8Array) ||
      input.buffer instanceof SharedArrayBuffer ||
      !input.byteLength ||
      input.byteLength > 64 * 1024
    )
      throw Error('invalid');
    const bytes = Buffer.from(input);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const manifest = Manifest.parse(JSON.parse(text) as unknown);
    if (canonicalJson(manifest) !== text) throw Error('invalid');
    return manifest;
  } catch {
    // Do not expose unknown keys, value fragments, parser details or causes.
    throw Error('Invalid protected needs manifest');
  }
}
