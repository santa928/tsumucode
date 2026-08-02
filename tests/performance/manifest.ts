import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

const PositiveInteger = z.number().int().positive();
const PositiveNumber = z.number().positive();

const PerformanceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  browser: z.literal('chromium'),
  runsPerExercise: PositiveInteger,
  warmupRuns: z.number().int().nonnegative(),
  previewP95Ms: PositiveNumber,
  validationP95Ms: PositiveNumber,
  exercises: z
    .array(
      z.object({
        id: z.string().regex(/^html-css-ch\d{2}-l\d{2}-e\d{2}$/u),
        category: z.enum([
          'simple',
          'median',
          'geometry',
          'layout',
          'responsive',
          'accessibility',
          'capstone',
        ]),
      }),
    )
    .length(10),
  webVitals: z.object({
    viewport: z.object({ width: PositiveInteger, height: PositiveInteger }),
    cpuSlowdownMultiplier: PositiveNumber,
    downloadKbps: PositiveNumber,
    uploadKbps: PositiveNumber,
    rttMs: PositiveNumber,
    lcpMaxMs: PositiveNumber,
    clsMax: PositiveNumber,
    interactionMaxMs: PositiveNumber,
  }),
  bundle: z.object({
    baselineCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    baselineEditorIncrementalJavaScriptGzipBytes: PositiveInteger,
    homeInitialJavaScriptGzipMaxBytes: PositiveInteger,
    editorIncrementalJavaScriptGzipMaxBytes: PositiveInteger,
    editorLoadedOnHome: z.literal(false),
  }),
  content: z.object({
    catalogGzipMaxBytes: z.literal(20_480),
    courseIndexGzipMaxBytes: z.literal(40_960),
    lessonManifestGzipMaxBytes: z.literal(12_288),
    routeMapAddedGzipMaxBytes: z.literal(8_192),
    singleImageMaxBytes: PositiveInteger,
    totalImagesMaxBytes: PositiveInteger,
    singleFontMaxBytes: PositiveInteger,
    totalFontsMaxBytes: PositiveInteger,
    authoringFieldsForbidden: z.array(z.string().min(1)).min(1),
  }),
  draftPersistenceMaxMs: PositiveNumber,
  starterReset: z.object({
    drawerReadyMaxMs: PositiveNumber,
    previewVisibleMaxMs: PositiveNumber,
    addedJavaScriptGzipMaxBytes: PositiveInteger,
  }),
  slideLibrary: z.object({
    baselineCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    baselineHomeInitialJavaScriptGzipBytes: PositiveInteger,
    addedHomeInitialJavaScriptGzipMaxBytes: PositiveInteger,
    interactionMaxMs: PositiveNumber,
  }),
  learningPath: z.object({
    baselineCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    addedHomeInitialJavaScriptGzipMaxBytes: PositiveInteger,
    interactionMaxMs: PositiveNumber,
  }),
});

const JavaScriptPerformanceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  browser: z.literal('chromium'),
  runsPerExercise: z.number().int().min(3),
  warmupRuns: z.number().int().nonnegative(),
  previewP95Ms: PositiveNumber,
  repeatPreviewP95Ms: PositiveNumber,
  validationP95Ms: PositiveNumber,
  exercises: z
    .array(
      z.object({
        id: z.string().regex(/^javascript-ch\d{2}-l\d{2}-e\d{2}$/u),
        category: z.enum(['simple']),
      }),
    )
    .length(1),
  bundle: z.object({
    homeInitialJavaScriptGzipMaxBytes: PositiveInteger,
    incrementalJavaScriptGzipMaxBytes: PositiveInteger,
    editorLoadedOnHome: z.literal(false),
  }),
  content: z.object({
    catalogGzipMaxBytes: z.literal(20_480),
    courseIndexGzipMaxBytes: z.literal(40_960),
    lessonManifestGzipMaxBytes: z.literal(12_288),
    authoringFieldsForbidden: z.array(z.string().min(1)).min(1),
  }),
});

export type PerformanceManifest = z.infer<typeof PerformanceManifestSchema>;
export type JavaScriptPerformanceManifest = z.infer<typeof JavaScriptPerformanceManifestSchema>;

/** Authoring性能ManifestをYAMLから読み、全予算と固定Exerciseをschema検証する。 */
export async function loadPerformanceManifest(
  path = 'content/html-css/performance.yaml',
): Promise<PerformanceManifest> {
  return PerformanceManifestSchema.parse(parse(await readFile(path, 'utf8')));
}

/** JavaScript vertical sliceの測定回数と配信量予算をYAMLからfail-closedで読む。 */
export async function loadJavaScriptPerformanceManifest(
  path = 'content/javascript/performance.yaml',
): Promise<JavaScriptPerformanceManifest> {
  return JavaScriptPerformanceManifestSchema.parse(parse(await readFile(path, 'utf8')));
}

/** nearest-rank方式で95 percentileを返し、入力配列は変更しない。 */
export function percentile95(values: readonly number[]): number {
  if (values.length === 0) throw new Error('p95には1件以上の測定値が必要です');
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  const value = sorted[index];
  if (value === undefined) throw new Error('p95を計算できませんでした');
  return value;
}
