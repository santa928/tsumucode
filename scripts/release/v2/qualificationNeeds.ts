import { parseDocument } from 'yaml';
import { z } from 'zod';

const entry = z
  .object({ result: z.literal('success'), outputs: z.object({}).strict().optional() })
  .strict();
const expectedNeeds = z
  .object({
    unit: entry,
    boundary: entry,
    python_fixtures: entry,
    browser: entry,
    public_boundary: entry,
    performance: entry,
  })
  .strict();

/** Validate the workflow's six direct needs; the trusted caller must supply GitHub's own context. */
export function parseQualificationNeeds(raw: unknown): Record<string, 'success'> {
  try {
    if (typeof raw !== 'string' || !raw.length || Buffer.byteLength(raw, 'utf8') > 64 * 1024)
      throw Error('Invalid needs size');
    // JSON.parse rejects YAML-only syntax; the YAML parser rejects decoded duplicate JSON keys.
    const parsed: unknown = JSON.parse(raw);
    const needs = expectedNeeds.parse(parsed);
    if (parseDocument(raw, { schema: 'json', uniqueKeys: true }).errors.length)
      throw Error('Duplicate needs keys');
    return Object.fromEntries(Object.keys(needs).map((job) => [job, 'success']));
  } catch {
    // Do not include raw context, unknown field names or nested validation causes in CI logs.
    throw Error('Qualification needs invalid');
  }
}
