import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { SuiteResultSchema } from './schema';
import { hashValue } from './identity';
import { writeProtocolJson } from './json';
function reportPath(root: string, row: z.infer<typeof SuiteResultSchema>) {
  return path.join(
    root,
    '.release-v2/reports',
    row.suite + '-' + String(row.verificationAttempt) + '.json',
  );
}
/** Preserve only sanitized actual observations; traces and private originals are not protocol reports. */
export async function storeSuiteReport(
  root: string,
  resultInput: unknown,
  report: unknown,
): Promise<void> {
  const result = SuiteResultSchema.parse(resultInput);
  if (result.status !== 'passed' || hashValue(report) !== result.reportDigest)
    throw new Error('Report differs from passed receipt');
  await writeProtocolJson(reportPath(root, result), report);
}
export async function verifyStoredReports(root: string, resultInput: unknown): Promise<void> {
  for (const result of z.array(SuiteResultSchema).parse(resultInput)) {
    const report = JSON.parse(await readFile(reportPath(root, result), 'utf8')) as unknown;
    if (hashValue(report) !== result.reportDigest)
      throw new Error('Original suite report missing or changed: ' + result.suite);
  }
}
