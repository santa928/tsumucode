import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import type { RunnerDiagnostic } from '../../../core/runtime/contracts';

/** 固定compilerの単一source mapだけを読む。外部URLや任意sourceRootは解決しない。 */
function readCompilerMap(
  text: string | undefined,
  file: string,
  originalFile: string,
): TraceMap | undefined {
  if (!text || text.length > 4_194_304) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const map = value as Record<string, unknown>;
    const basename = file.slice(file.lastIndexOf('/') + 1);
    if (
      map['version'] !== 3 ||
      map['file'] !== basename ||
      map['sourceRoot'] !== '' ||
      !Array.isArray(map['sources']) ||
      map['sources'].length !== 1 ||
      map['sources'][0] !== originalFile.slice(originalFile.lastIndexOf('/') + 1) ||
      !Array.isArray(map['names']) ||
      !map['names'].every((name) => typeof name === 'string') ||
      typeof map['mappings'] !== 'string'
    )
      return undefined;
    return new TraceMap({
      version: 3,
      sources: map['sources'],
      names: map['names'],
      mappings: map['mappings'],
    });
  } catch {
    return undefined;
  }
}

/** 生成JSの位置だけ元TSへ戻す。対応不能なJS位置は省き、非JS診断はそのまま保持する。 */
export function mapTypeScriptDiagnostics(
  diagnostics: readonly RunnerDiagnostic[],
  sourceMaps: Readonly<Record<string, string>>,
  sources: Readonly<Record<string, string>>,
): readonly RunnerDiagnostic[] {
  const maps = new Map<string, TraceMap | undefined>();
  return diagnostics.map((diagnostic) => {
    const { file, line, column, ...detail } = diagnostic;
    if (!file?.endsWith('.js')) return diagnostic;
    const tsFile = file.replace(/\.js$/u, '.ts');
    const originalFile = Object.hasOwn(sources, tsFile) ? tsFile : tsFile + 'x';
    if (!Object.hasOwn(sources, originalFile)) return detail;
    if (!maps.has(file)) maps.set(file, readCompilerMap(sourceMaps[file], file, originalFile));
    const map = maps.get(file);
    if (!map) return detail;
    if (line === undefined || column === undefined) return { ...detail, file: originalFile };
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1)
      return detail;
    try {
      const original = originalPositionFor(map, { line, column: column - 1 });
      if (original.source !== originalFile.slice(originalFile.lastIndexOf('/') + 1)) return detail;
      const sourceLine = sources[originalFile]?.split(/\r\n|\r|\n/u)[original.line - 1];
      if (
        !Number.isSafeInteger(original.line) ||
        !Number.isSafeInteger(original.column) ||
        original.line < 1 ||
        original.column < 0 ||
        sourceLine === undefined ||
        original.column > sourceLine.length
      )
        return detail;
      return { ...detail, file: originalFile, line: original.line, column: original.column + 1 };
    } catch {
      return detail;
    }
  });
}
