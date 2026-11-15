// Test-only shape check. This does not authenticate a workflow, run or input origin.
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { Buffer } from 'node:buffer';

const entry = z
  .object({ result: z.literal('success'), outputs: z.object({}).strict().optional() })
  .strict();
const expected = z
  .object({
    unit: entry,
    boundary: entry,
    python_fixtures: entry,
    browser: entry,
    public_boundary: entry,
    performance: entry,
  })
  .strict();

/** Conservative synthetic policy: values are never returned and no authorization is granted. */
export function inspectSyntheticNeeds(raw) {
  try {
    if (typeof raw !== 'string' || !raw.length || Buffer.byteLength(raw, 'utf8') > 64 * 1024)
      throw Error('invalid input');
    // JSON.parse limits syntax to JSON; YAML's uniqueKeys detects duplicate decoded keys.
    const parsed = JSON.parse(raw);
    expected.parse(parsed);
    const document = parseDocument(raw, { schema: 'json', uniqueKeys: true });
    if (document.errors.length) throw Error('duplicate or invalid keys');
    return Object.freeze({ authorizationGranted: false });
  } catch {
    throw Error('Synthetic needs shape rejected');
  }
}
