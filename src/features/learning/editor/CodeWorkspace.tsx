/** 親管理の複数file stateと単一editor instanceを接続する学習UI。 */
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { EditorCursor } from '../../../core/persistence/contracts';
import type { RunnerDiagnostic } from '../../../core/runtime/contracts';
import type { EditorAdapter, EditorHandle } from './EditorAdapter';

export interface CodeWorkspaceProps {
  readonly adapter: EditorAdapter;
  readonly files: Readonly<Record<string, string>>;
  readonly languages: Readonly<Record<string, string>>;
  readonly selectedFile: string;
  readonly cursors: Readonly<Record<string, EditorCursor>>;
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly onChange: (path: string, content: string) => void;
  readonly onCursorChange: (path: string, cursor: EditorCursor) => void;
  readonly onSelectedFileChange: (path: string) => void;
}

/** 重複診断もReact上で安定して描画できる局所keyを生成する。 */
function diagnosticKey(diagnostic: RunnerDiagnostic, index: number): string {
  return [
    diagnostic.code,
    diagnostic.file ?? 'all',
    String(diagnostic.line ?? 0),
    String(diagnostic.column ?? 0),
    String(index),
  ].join('-');
}

/** WAI-ARIA tabsの移動keyを次にfocusするfile indexへ変換する。 */
function tabDestinationIndex(key: string, currentIndex: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (currentIndex + 1) % count;
    case 'ArrowLeft':
      return (currentIndex - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** controlled propsをCodeMirrorへ同期し、編集結果を最新の選択fileへ通知する。 */
export function CodeWorkspace(props: CodeWorkspaceProps) {
  const workspaceId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  const propsRef = useRef(props);

  useLayoutEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initial = propsRef.current;
    const initialCursor = initial.cursors[initial.selectedFile];

    const handle = props.adapter.mount({
      parent: host,
      path: initial.selectedFile,
      language: initial.languages[initial.selectedFile] ?? 'text',
      content: initial.files[initial.selectedFile] ?? '',
      ...(initialCursor ? { cursor: initialCursor } : {}),
      diagnostics: initial.diagnostics,
      onChange: (content) => {
        const current = propsRef.current;
        current.onChange(current.selectedFile, content);
      },
      onCursorChange: (cursor) => {
        const current = propsRef.current;
        current.onCursorChange(current.selectedFile, cursor);
      },
    });
    handleRef.current = handle;

    return () => {
      handle.destroy();
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [props.adapter]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setDocument({
      path: props.selectedFile,
      language: props.languages[props.selectedFile] ?? 'text',
      content: props.files[props.selectedFile] ?? '',
      diagnostics: props.diagnostics,
    });
    handle.setSelection(props.cursors[props.selectedFile]);
  }, [props.selectedFile, props.files, props.languages, props.cursors, props.diagnostics]);

  const visibleDiagnostics = props.diagnostics.filter(
    ({ file }) => file === undefined || file === props.selectedFile,
  );
  const filePaths = Object.keys(props.files);
  const selectedIndex = filePaths.indexOf(props.selectedFile);
  const headingId = `${workspaceId}-heading`;
  const panelId = `${workspaceId}-panel`;
  const selectedTabId = `${workspaceId}-tab-${String(Math.max(0, selectedIndex))}`;

  /** Arrow／Home／Endでtab選択とfocusを同期する。 */
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const destination = tabDestinationIndex(event.key, index, filePaths.length);
    if (destination === null) return;
    event.preventDefault();
    const path = filePaths[destination];
    if (!path) return;
    props.onSelectedFileChange(path);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(destination)
      .focus();
  };

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-workshop-lg border border-workshop-border bg-workshop-surface shadow-[var(--tc-shadow-piece)]"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-workshop-border bg-workshop-raised px-4 py-4 md:px-5">
        <div>
          <p className="text-sm font-black text-workshop-complete">コード作業台</p>
          <h2 id={headingId} className="mt-1 text-xl font-black">
            コードを組み立てる
          </h2>
        </div>
        <p className="rounded-workshop-sm bg-workshop-workbench px-3 py-1.5 text-sm font-bold text-workshop-muted">
          {filePaths.length}個のファイルピース
        </p>
      </header>
      <div
        role="tablist"
        aria-label="演習ファイル"
        className="flex max-w-full gap-2 overflow-x-auto border-b border-workshop-border bg-workshop-workbench px-3 pt-3 md:px-4"
      >
        {filePaths.map((path, index) => (
          <button
            key={path}
            id={`${workspaceId}-tab-${String(index)}`}
            type="button"
            role="tab"
            aria-selected={path === props.selectedFile}
            aria-controls={panelId}
            data-state={path === props.selectedFile ? 'selected' : 'idle'}
            tabIndex={path === props.selectedFile ? 0 : -1}
            onClick={() => {
              props.onSelectedFileChange(path);
            }}
            onKeyDown={(event) => {
              handleTabKeyDown(event, index);
            }}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-t-workshop-sm border border-b-0 px-3 py-2 font-mono text-sm font-bold transition-[transform,background-color] duration-[var(--tc-motion-fast)] ${
              path === props.selectedFile
                ? '-translate-y-0.5 border-workshop-primary bg-workshop-surface text-workshop-primary'
                : 'border-workshop-border bg-workshop-sunken text-workshop-muted hover:bg-workshop-raised'
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-workshop-piece ${
                path === props.selectedFile ? 'bg-workshop-learning' : 'bg-workshop-wood'
              }`}
            />
            {path}
          </button>
        ))}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={selectedTabId}
        className="min-w-0 bg-workshop-raised"
      >
        <div
          ref={hostRef}
          aria-label={`${props.selectedFile} のコードエディター`}
          className="tc-code-editor-host"
        />
      </div>
      <ul
        aria-label="コード診断"
        aria-live="polite"
        className="space-y-2 border-t border-workshop-border bg-workshop-surface p-3 empty:hidden"
      >
        {visibleDiagnostics.map((diagnostic, index) => (
          <li
            key={diagnosticKey(diagnostic, index)}
            className="rounded-workshop-sm border-l-4 border-workshop-correction bg-workshop-raised px-3 py-2 text-sm font-bold text-workshop-correction"
          >
            {diagnostic.learnerMessage}
          </li>
        ))}
      </ul>
    </section>
  );
}
