import type { RunnerConsoleRecord } from '../../../core/runtime/contracts';

export type ConsoleFreshness = 'current' | 'previous-success';

export interface RuntimeConsoleProps {
  readonly records: readonly RunnerConsoleRecord[];
  readonly freshness: ConsoleFreshness;
}

/** Runnerのbounded plain text記録を、色だけに依存しないConsole一覧として表示する。 */
export function RuntimeConsole({ records, freshness }: RuntimeConsoleProps) {
  return (
    <section className="tc-runtime-console" role="region" aria-label="Console出力" tabIndex={0}>
      {freshness === 'previous-success' ? (
        <p className="tc-runtime-console-freshness">前回成功時のConsoleです</p>
      ) : null}
      {records.length === 0 ? (
        <p className="tc-runtime-console-empty">まだConsole出力はありません</p>
      ) : (
        <ol className="tc-runtime-console-list">
          {records.map((record) => (
            <li
              key={record.sequence}
              className="tc-runtime-console-record"
              data-console-level={record.level}
            >
              <span className="tc-runtime-console-level">{record.level}</span>
              <code>{record.text}</code>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
