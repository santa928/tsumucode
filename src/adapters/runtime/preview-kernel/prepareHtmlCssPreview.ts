import type { RunnerDiagnostic, RunnerInput } from '../../../core/runtime/contracts';
import { resolvePublicAsset } from '../../../shared/lib/resolvePublicAsset';
import {
  materializePreviewAssets,
  type MaterializedPreviewAssets,
} from './materializePreviewAssets';
import { sanitizeCss } from './sanitizeCss';
import { sanitizeHtml } from './sanitizeHtml';

export interface ValidatedHtmlCssPreviewInput {
  readonly entryFile: string;
  readonly htmlSource: string;
  readonly files: ReadonlyMap<string, string>;
}

export interface PreparedPreviewStylesheet {
  readonly file: string;
  readonly source?: string;
  readonly diagnostics: readonly RunnerDiagnostic[];
}

export interface PreparedHtmlCssPreview {
  readonly entryFile: string;
  readonly htmlSource: string;
  readonly stylesheets: readonly PreparedPreviewStylesheet[];
  readonly sanitizedDocument: Document;
  readonly css: string;
  readonly sanitizerDiagnostics: readonly RunnerDiagnostic[];
  readonly assetDiagnostics: readonly RunnerDiagnostic[];
  readonly materialized: MaterializedPreviewAssets;
}

export interface PrepareHtmlCssPreviewOptions {
  readonly signal?: AbortSignal;
}

const SAFE_ID = /^[a-z0-9._:-]+$/iu;

/** Workspace内pathをFoundationと同じroot基準のcanonical keyへ変換する。 */
function canonicalWorkspacePath(path: string): string {
  return resolvePublicAsset('/', path).slice(1);
}

/** 全file keyをcanonical化し、同一fileの別表記による衝突を拒否する。 */
function canonicalFiles(files: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  const canonical = new Map<string, string>();
  for (const [path, source] of Object.entries(files)) {
    let key: string;
    try {
      key = canonicalWorkspacePath(path);
    } catch {
      throw new Error(`Preview file path must be safe: ${path}`);
    }
    if (canonical.has(key)) throw new Error(`Preview file path collision: ${key}`);
    canonical.set(key, source);
  }
  return canonical;
}

/** Full／read-only共通の入力境界をiframe更新前に検証する。 */
export function validateHtmlCssPreviewInput(input: RunnerInput): ValidatedHtmlCssPreviewInput {
  const configuredReducedMotion = (input.viewport as { readonly reducedMotion?: unknown })
    .reducedMotion;
  if (input.languageId !== 'html-css') throw new Error('Runner languageId mismatch');
  if (
    !SAFE_ID.test(input.exerciseSessionId) ||
    input.exerciseSessionId.length > 256 ||
    !Number.isInteger(input.executionRevision) ||
    input.executionRevision < 0
  ) {
    throw new Error('Invalid preview identity');
  }
  if (
    !SAFE_ID.test(input.viewport.id) ||
    input.viewport.id.length > 256 ||
    !Number.isInteger(input.viewport.width) ||
    input.viewport.width <= 0 ||
    !Number.isInteger(input.viewport.height) ||
    input.viewport.height <= 0 ||
    (configuredReducedMotion !== undefined && configuredReducedMotion !== 'reduce')
  ) {
    throw new Error('Invalid preview viewport');
  }
  const option = input.options.entryFile;
  if (option !== undefined && typeof option !== 'string') {
    throw new Error('Preview entryFile must be a string');
  }
  const requestedEntryFile = option ?? 'index.html';
  let entryFile: string;
  try {
    entryFile = canonicalWorkspacePath(requestedEntryFile);
  } catch {
    throw new Error('Preview entryFile must be a safe relative path');
  }
  if (!/\.html?$/iu.test(entryFile)) throw new Error('Preview entryFile must be HTML');
  const files = canonicalFiles(input.files);
  const htmlSource = files.get(entryFile);
  if (htmlSource === undefined) throw new Error(`Preview entryFile not found: ${entryFile}`);
  return { entryFile, htmlSource, files };
}

/** sanitized HTML内のstylesheet参照をdocument orderで重複排除する。 */
function stylesheetReferences(documentValue: Document): readonly string[] {
  const references: string[] = [];
  const seen = new Set<string>();
  for (const link of documentValue.querySelectorAll('link[rel][href]')) {
    if (link.getAttribute('rel')?.trim().toLowerCase() !== 'stylesheet') continue;
    const href = link.getAttribute('href');
    if (href === null) continue;
    const canonical = canonicalWorkspacePath(href);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    references.push(canonical);
  }
  return references;
}

/** 存在しないstylesheet参照を学習者向け診断へ変換する。 */
function missingStylesheet(file: string): RunnerDiagnostic {
  return {
    code: 'CSS_REFERENCE_MISSING',
    kind: 'reference',
    severity: 'error',
    message: `Stylesheet not found: ${file}`,
    learnerMessage: `${file} が見つかりません。link要素のhrefとファイル名を確認してください。`,
    file,
  };
}

/** Asset materializeとHTML/CSS sanitizerを共有し、静的DOMと診断材料を返す。 */
export async function prepareHtmlCssPreview(
  input: RunnerInput,
  validated: ValidatedHtmlCssPreviewInput,
  options: PrepareHtmlCssPreviewOptions = {},
): Promise<PreparedHtmlCssPreview> {
  const materialized = await materializePreviewAssets(
    input.assets,
    options.signal === undefined ? {} : { signal: options.signal },
  );
  try {
    const sanitizedHtml = sanitizeHtml(validated.htmlSource, materialized.assets);
    const stylesheets: PreparedPreviewStylesheet[] = [];
    const sanitizedCss: {
      readonly css: string;
      readonly diagnostics: readonly RunnerDiagnostic[];
    }[] = [];
    for (const reference of stylesheetReferences(sanitizedHtml.document)) {
      const source = validated.files.get(reference);
      if (source === undefined) {
        stylesheets.push({
          file: reference,
          diagnostics: [missingStylesheet(reference)],
        });
        continue;
      }
      stylesheets.push({ file: reference, source, diagnostics: [] });
      sanitizedCss.push(sanitizeCss(source, materialized.assets));
    }
    return {
      entryFile: validated.entryFile,
      htmlSource: validated.htmlSource,
      stylesheets,
      sanitizedDocument: sanitizedHtml.document,
      css: sanitizedCss.map(({ css }) => css).join('\n'),
      sanitizerDiagnostics: [
        ...sanitizedHtml.diagnostics,
        ...sanitizedCss.flatMap(({ diagnostics }) => diagnostics),
      ],
      assetDiagnostics: materialized.diagnostics,
      materialized,
    };
  } catch (error) {
    materialized.dispose();
    throw error;
  }
}
