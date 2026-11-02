import { z } from 'zod';
import { hashValue } from './identity';

const MetricSchema = z.object({ numericValue: z.number().nonnegative() });
const ReportSchema = z.object({
  requestedUrl: z.url(),
  fetchTime: z.iso.datetime(),
  lighthouseVersion: z.string().min(1),
  runtimeError: z.never().optional(),
  audits: z.object({
    'largest-contentful-paint': MetricSchema,
    'cumulative-layout-shift': MetricSchema,
    'resource-summary': z.object({
      details: z.object({
        items: z.array(
          z.object({ resourceType: z.string(), transferSize: z.number().nonnegative() }),
        ),
      }),
    }),
  }),
});

/** LHCIは成功時に失敗一覧[]を返す。固定command成功後、設定した全回の新しい実測も必須にする。 */
export function readLighthouseCoverage(
  reportsInput: unknown,
  assertionsInput: unknown,
  contextInput: unknown,
) {
  const context = z
    .object({
      urls: z.array(z.url()).min(1),
      runs: z.number().int().positive(),
      startedAt: z.iso.datetime(),
      now: z.iso.datetime(),
    })
    .strict()
    .parse(contextInput);
  const assertions = z
    .array(z.object({ level: z.string().optional(), passed: z.boolean() }))
    .parse(assertionsInput);
  if (assertions.some((row) => row.level === 'error' && !row.passed))
    throw new Error('Lighthouse budget failed');
  const reports = z.array(ReportSchema).min(1).parse(reportsInput);
  const originals = z.array(z.unknown()).parse(reportsInput);
  if (
    new Set(context.urls).size !== context.urls.length ||
    reports.length !== context.urls.length * context.runs ||
    Date.parse(context.startedAt) > Date.parse(context.now)
  )
    throw new Error('Incomplete Lighthouse collection');
  const counts = new Map(context.urls.map((url) => [url, 0]));
  const seen = new Set<string>();
  const measurements = reports.map((report, index) => {
    const identity = report.requestedUrl + '/' + report.fetchTime;
    const time = Date.parse(report.fetchTime);
    if (
      !counts.has(report.requestedUrl) ||
      seen.has(identity) ||
      time < Date.parse(context.startedAt) ||
      time > Date.parse(context.now)
    )
      throw new Error('Stale, duplicate or unknown Lighthouse measurement');
    seen.add(identity);
    counts.set(report.requestedUrl, counts.get(report.requestedUrl)! + 1);
    const scripts = report.audits['resource-summary'].details.items.filter(
      (row) => row.resourceType === 'script',
    );
    if (scripts.length !== 1) throw new Error('Missing Lighthouse script measurement');
    return {
      url: report.requestedUrl,
      fetchTime: report.fetchTime,
      lighthouseVersion: report.lighthouseVersion,
      reportDigest: hashValue(originals[index]),
      lcpMs: report.audits['largest-contentful-paint'].numericValue,
      cls: report.audits['cumulative-layout-shift'].numericValue,
      scriptBytes: scripts[0]!.transferSize,
    };
  });
  if ([...counts.values()].some((count) => count !== context.runs))
    throw new Error('Missing Lighthouse URL runs');
  return { assertions: assertionsInput, measurements };
}
