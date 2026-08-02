/** Runner診断の位置表示を、案内文との重複を避けて組み立てる。 */
import type { RunnerDiagnostic } from '../../core/runtime/contracts';

/** 診断位置をFile、行、列の利用可能な範囲で短く返す。 */
export function diagnosticLocation(diagnostic: RunnerDiagnostic): string | undefined {
  if (diagnostic.file === undefined) return undefined;
  const line = diagnostic.line === undefined ? '' : `:${String(diagnostic.line)}`;
  const column = diagnostic.column === undefined ? '' : `:${String(diagnostic.column)}`;
  return `${diagnostic.file}${line}${column}`;
}

/** 学習者向け文に同じFile・行が含まれない場合だけ補助位置を返す。 */
export function supplementalDiagnosticLocation(diagnostic: RunnerDiagnostic): string | undefined {
  const location = diagnosticLocation(diagnostic);
  if (
    location === undefined ||
    diagnostic.file === undefined ||
    !diagnostic.learnerMessage.includes(diagnostic.file)
  ) {
    return location;
  }
  if (diagnostic.line === undefined) return undefined;
  const line = String(diagnostic.line);
  const alreadyLocated =
    diagnostic.learnerMessage.includes(`${line}行`) ||
    diagnostic.learnerMessage.includes(`:${line}`) ||
    diagnostic.learnerMessage.toLowerCase().includes(`line ${line}`);
  return alreadyLocated ? undefined : location;
}
