/** 教材の静的コードを軽く色分けする。Editor、構文解析器、実行環境は読み込まない。 */
import type { SlideBlock } from '../../../core/content/types';

type CodeBlock = Extract<SlideBlock, { type: 'code' }>;
const TOKEN =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$|<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*|\b(?:function|return|const|let|if|else|new)\b|#[\da-fA-F]{3,8}\b|\b\d+(?:\.\d+)?\b|\b[\w-]+(?=\s*:))/gu;

/** 文字列を保持したまま装飾する。未知言語と出力は色に意味を付けずそのまま表示する。 */
function colorize(line: string, language: string) {
  if (!['js', 'javascript', 'html', 'css'].includes(language)) return line;
  return line.split(TOKEN).map((part, index) => {
    if (index % 2 === 0) return part;
    const tone = /^['"]/.test(part) ? 'string' : /^(\/\/|<!--)/.test(part) ? 'comment' : 'syntax';
    return (
      <span key={index} className={`tc-code-token-${tone}`}>
        {part}
      </span>
    );
  });
}

/** ラベル・注目行・静的結果を表示し、読み上げとコピー用のコード文字列を保つ。 */
export function SlideCode({
  block,
  compact,
}: {
  readonly block: CodeBlock;
  readonly compact: boolean;
}) {
  const output = block.role === 'output';
  const label = block.label ?? block.language;
  return (
    <figure className="tc-slide-code" data-code-role={block.role ?? 'example'}>
      <figcaption className="tc-slide-code-label">
        {output ? 'この例の出力（静的な例） · ' : block.role === 'input' ? '入力コード · ' : ''}
        {label}
        {block.highlightedLines?.length ? (
          <span className="tc-slide-code-focus">注目：{block.highlightedLines.join('・')}行目</span>
        ) : null}
      </figcaption>
      <pre
        tabIndex={0}
        data-slide-horizontal-scroll
        aria-label={`${label}${output ? 'の出力例' : 'のコード例'}（横スクロール可能）`}
        className={compact ? 'p-3' : 'p-4'}
      >
        <code className="font-mono">
          {block.code.split('\n').map((line, index, lines) => (
            <span
              key={index}
              className="tc-slide-code-line"
              data-highlighted={block.highlightedLines?.includes(index + 1) || undefined}
            >
              {output ? line : colorize(line, block.language)}
              {index < lines.length - 1 ? '\n' : ''}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
