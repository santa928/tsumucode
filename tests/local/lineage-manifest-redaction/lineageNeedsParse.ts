import type { z } from 'zod';

/** Suppress untrusted schema details; successful parsing is not origin authentication. */
export function parsePrivateNeedsInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch {
    // Never expose unknown keys, values, Zod details or a cause.
    throw Error('Invalid direct-needs input');
  }
}
