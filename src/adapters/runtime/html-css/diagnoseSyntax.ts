import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import type { RunnerDiagnostic } from '../../../core/runtime/contracts';

interface SyntaxErrorPosition {
  readonly from: number;
  readonly to: number;
}

/** Source内の各行が始まるUTF-16 offsetを一度だけ収集する。 */
function collectLineStarts(source: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\r') {
      if (source[index + 1] === '\n') index += 1;
      starts.push(index + 1);
    } else if (source[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

/** UTF-16 offsetを二分探索で学習者向けの1-based行・列へ変換する。 */
function sourcePosition(
  lineStarts: readonly number[],
  offset: number,
): { readonly line: number; readonly column: number } {
  let low = 0;
  let high = lineStarts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle]! <= offset) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: offset - lineStarts[low]! + 1 };
}

/** Lezer error nodeを位置順・重複なしのsyntax diagnosticへ変換する。 */
export function diagnoseSyntax(
  language: 'html' | 'css',
  source: string,
  file: string,
): readonly RunnerDiagnostic[] {
  const parser = language === 'html' ? htmlLanguage.parser : cssLanguage.parser;
  const positions: SyntaxErrorPosition[] = [];
  parser.parse(source).iterate({
    enter(node) {
      if (node.type.isError) positions.push({ from: node.from, to: node.to });
    },
  });

  positions.sort((left, right) => left.from - right.from || left.to - right.to);
  const lineStarts = collectLineStarts(source);
  const seen = new Set<string>();
  const diagnostics: RunnerDiagnostic[] = [];
  for (const position of positions) {
    const key = `${String(position.from)}:${String(position.to)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { line, column } = sourcePosition(lineStarts, position.from);
    diagnostics.push({
      code: `${language.toUpperCase()}_SYNTAX`,
      kind: 'syntax',
      severity: 'error',
      message: `${file}:${String(line)}:${String(column)} parse error`,
      learnerMessage: `${file}の${String(line)}行目${String(column)}文字目付近の書き方を確認してください。`,
      file,
      line,
      column,
    });
  }
  return diagnostics;
}
