/** 親管理の複数file stateと単一editor instanceを接続する学習UI。 */
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import type { EditorCursor } from '../../../core/persistence/contracts';
import type { RunnerDiagnostic } from '../../../core/runtime/contracts';
import { supplementalDiagnosticLocation } from '../diagnosticLocation';
import type { EditorAdapter, EditorHandle } from './EditorAdapter';

export interface CodeWorkspaceProps {
  readonly adapter: EditorAdapter;
  readonly files: Readonly<Record<string, string>>;
  readonly languages: Readonly<Record<string, string>>;
  readonly selectedFile: string;
  /** filesを最後に受理したSession revision。 */
  readonly contentRevision: number;
  readonly cursors: Readonly<Record<string, EditorCursor>>;
  readonly diagnostics: readonly RunnerDiagnostic[];
  /** 値が変わるたび、履歴を保持した既存EditorへFocusを戻す要求ID。 */
  readonly editorFocusRequestId?: number;
  /** 親が作業台Header右側へ渡す副操作。 */
  readonly headerAction?: ReactNode;
  /** 受理時はSessionの次revision、拒否時はundefinedを返す。 */
  readonly onChange: (path: string, content: string) => number | undefined;
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
  const editorHelpId = `${workspaceId}-editor-help`;
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  const propsRef = useRef(props);
  const handledFocusRequestRef = useRef(props.editorFocusRequestId);

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
      contentRevision: initial.contentRevision,
      descriptionId: editorHelpId,
      ...(initialCursor ? { cursor: initialCursor } : {}),
      diagnostics: initial.diagnostics,
      onChange: (content) => {
        const current = propsRef.current;
        return current.onChange(current.selectedFile, content);
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
  }, [editorHelpId, props.adapter]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setDocument({
      path: props.selectedFile,
      language: props.languages[props.selectedFile] ?? 'text',
      content: props.files[props.selectedFile] ?? '',
      contentRevision: props.contentRevision,
      diagnostics: props.diagnostics,
    });
    handle.setSelection(props.cursors[props.selectedFile]);
  }, [
    props.selectedFile,
    props.files,
    props.languages,
    props.contentRevision,
    props.cursors,
    props.diagnostics,
  ]);

  useEffect(() => {
    if (handledFocusRequestRef.current === props.editorFocusRequestId) return;
    handledFocusRequestRef.current = props.editorFocusRequestId;
    handleRef.current?.focus();
  }, [props.editorFocusRequestId]);

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
      data-has-diagnostics={visibleDiagnostics.length > 0 ? 'true' : 'false'}
      className="overflow-hidden rounded-workshop-lg border border-workshop-border bg-workshop-surface shadow-[var(--tc-shadow-piece)]"
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-workshop-border bg-workshop-raised px-4 py-2 md:px-5">
        <div>
          <p className="text-sm font-black text-workshop-complete">コード作業台</p>
          <h2 id={headingId} className="mt-1 text-xl font-black">
            コードを組み立てる
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <p className="whitespace-nowrap rounded-workshop-sm bg-workshop-workbench px-2 py-1 text-xs font-bold text-workshop-muted">
            {filePaths.length}個のファイルピース
          </p>
          {props.headerAction === undefined ? null : (
            <div className="[&>*]:min-h-11">{props.headerAction}</div>
          )}
        </div>
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
        <p
          id={editorHelpId}
          className="border-b border-workshop-border bg-workshop-workbench px-4 py-2 text-xs font-bold text-workshop-muted"
        >
          Tabで字下げ、Shift+Tabで戻す。Escの後にTabを押すとエディターを出られます。
        </p>
        <div
          ref={hostRef}
          aria-label={`${props.selectedFile} のコードエディター`}
          className="tc-code-editor-host"
        />
      </div>
      <ul
        aria-label="コード診断"
        aria-live="polite"
        tabIndex={visibleDiagnostics.length > 0 ? 0 : -1}
        className="tc-code-diagnostics space-y-2 border-t border-workshop-border bg-workshop-surface p-3 empty:hidden"
      >
        {visibleDiagnostics.map((diagnostic, index) => (
          <li
            key={diagnosticKey(diagnostic, index)}
            className="rounded-workshop-sm border-l-4 border-workshop-correction bg-workshop-raised px-3 py-2 text-sm font-bold text-workshop-correction"
          >
            {supplementalDiagnosticLocation(diagnostic) === undefined ? null : (
              <span className="mr-2 font-mono text-xs">
                {supplementalDiagnosticLocation(diagnostic)}
              </span>
            )}
            <span>{diagnostic.learnerMessage}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
