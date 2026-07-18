import { screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorCursor } from '../../../core/persistence/contracts';
import type { RunnerDiagnostic } from '../../../core/runtime/contracts';
import { renderWithRouter } from '../../../test/renderWithRouter';
import { CodeWorkspace, type CodeWorkspaceProps } from './CodeWorkspace';
import type { EditorAdapter, EditorHandle, EditorMountInput } from './EditorAdapter';

interface FakeEditor {
  readonly adapter: EditorAdapter;
  readonly handle: EditorHandle;
  readonly mount: ReturnType<typeof vi.fn<(input: EditorMountInput) => EditorHandle>>;
  readonly setDocument: ReturnType<typeof vi.fn<EditorHandle['setDocument']>>;
  readonly setSelection: ReturnType<typeof vi.fn<EditorHandle['setSelection']>>;
  readonly destroy: ReturnType<typeof vi.fn<EditorHandle['destroy']>>;
}

/** Component test用にmount入力とimperative更新を観測できるadapterを作る。 */
function createFakeEditor(): FakeEditor {
  const setDocument = vi.fn<EditorHandle['setDocument']>();
  const setSelection = vi.fn<EditorHandle['setSelection']>();
  const destroy = vi.fn<EditorHandle['destroy']>();
  const handle: EditorHandle = {
    setDocument,
    setSelection,
    focus: vi.fn(),
    destroy,
  };
  const mount = vi.fn<(input: EditorMountInput) => EditorHandle>(() => handle);
  return { adapter: { mount }, handle, mount, setDocument, setSelection, destroy };
}

const diagnostics: readonly RunnerDiagnostic[] = [
  {
    code: 'html-heading',
    kind: 'syntax',
    severity: 'error',
    message: 'heading',
    learnerMessage: 'HTMLの見出しを確認してください',
    file: 'index.html',
  },
  {
    code: 'css-color',
    kind: 'syntax',
    severity: 'warning',
    message: 'color',
    learnerMessage: 'CSSの色を確認してください',
    file: 'style.css',
  },
  {
    code: 'workspace',
    kind: 'system',
    severity: 'warning',
    message: 'workspace',
    learnerMessage: 'ワークスペース全体を確認してください',
  },
];

interface HarnessProps {
  readonly adapter: EditorAdapter;
  readonly onChange: CodeWorkspaceProps['onChange'];
  readonly onCursorChange: CodeWorkspaceProps['onCursorChange'];
}

/** 親管理のselectedFileを再現してcontrolled同期を実挙動で検証する。 */
function Harness({ adapter, onChange, onCursorChange }: HarnessProps) {
  const [selectedFile, setSelectedFile] = useState('index.html');
  const cursors: Readonly<Record<string, EditorCursor>> = {
    'index.html': { anchor: 2, head: 2 },
    'style.css': { anchor: 4, head: 4 },
  };

  return (
    <CodeWorkspace
      adapter={adapter}
      files={{ 'index.html': '<main />', 'style.css': 'main{}' }}
      languages={{ 'index.html': 'html', 'style.css': 'css' }}
      selectedFile={selectedFile}
      cursors={cursors}
      diagnostics={diagnostics}
      onChange={onChange}
      onCursorChange={onCursorChange}
      onSelectedFileChange={setSelectedFile}
    />
  );
}

describe('CodeWorkspace', () => {
  it('1つのeditorをmountし、file切替後のdocument・cursor・通知先を同期する', async () => {
    const editor = createFakeEditor();
    const onChange = vi.fn<CodeWorkspaceProps['onChange']>();
    const onCursorChange = vi.fn<CodeWorkspaceProps['onCursorChange']>();
    const { user } = renderWithRouter(
      <Harness adapter={editor.adapter} onChange={onChange} onCursorChange={onCursorChange} />,
    );

    expect(editor.mount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'コードを組み立てる' })).toBeInTheDocument();
    expect(screen.getByText('2個のファイルピース')).toBeInTheDocument();
    expect(screen.getByLabelText('index.html のコードエディター')).toBeInTheDocument();

    const indexTab = screen.getByRole('tab', { name: 'index.html' });
    const styleTab = screen.getByRole('tab', { name: 'style.css' });
    const tabPanel = screen.getByRole('tabpanel');
    expect(indexTab).toHaveAttribute('tabindex', '0');
    expect(indexTab).toHaveAttribute('data-state', 'selected');
    expect(styleTab).toHaveAttribute('tabindex', '-1');
    expect(styleTab).toHaveAttribute('data-state', 'idle');
    expect(indexTab).toHaveAttribute('aria-controls', tabPanel.id);
    expect(tabPanel).toHaveAttribute('aria-labelledby', indexTab.id);

    indexTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(editor.mount).toHaveBeenCalledTimes(1);
    expect(editor.setDocument).toHaveBeenLastCalledWith({
      path: 'style.css',
      language: 'css',
      content: 'main{}',
      diagnostics,
    });
    expect(editor.setSelection).toHaveBeenLastCalledWith({ anchor: 4, head: 4 });
    expect(styleTab).toHaveFocus();
    expect(styleTab).toHaveAttribute('aria-selected', 'true');
    expect(styleTab).toHaveAttribute('data-state', 'selected');
    expect(indexTab).toHaveAttribute('data-state', 'idle');
    expect(styleTab).toHaveAttribute('tabindex', '0');
    expect(tabPanel).toHaveAttribute('aria-labelledby', styleTab.id);
    expect(screen.getByLabelText('style.css のコードエディター')).toBeInTheDocument();

    const mountInput = editor.mount.mock.calls[0]![0];
    mountInput.onChange('main { color: red; }');
    mountInput.onCursorChange({ anchor: 7, head: 7 });
    expect(onChange).toHaveBeenCalledWith('style.css', 'main { color: red; }');
    expect(onCursorChange).toHaveBeenCalledWith('style.css', { anchor: 7, head: 7 });

    await user.keyboard('{Home}');
    expect(indexTab).toHaveFocus();
    expect(indexTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(styleTab).toHaveFocus();
    expect(styleTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(indexTab).toHaveFocus();
    expect(indexTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{End}');
    expect(styleTab).toHaveFocus();
    expect(styleTab).toHaveAttribute('aria-selected', 'true');
  });

  it('選択fileと共通のdiagnosticだけをaria-live領域へ表示する', async () => {
    const editor = createFakeEditor();
    const { user } = renderWithRouter(
      <Harness adapter={editor.adapter} onChange={vi.fn()} onCursorChange={vi.fn()} />,
    );

    const diagnosticList = screen.getByRole('list', { name: 'コード診断' });
    expect(diagnosticList).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('HTMLの見出しを確認してください')).toBeInTheDocument();
    expect(screen.getByText('ワークスペース全体を確認してください')).toBeInTheDocument();
    expect(screen.queryByText('CSSの色を確認してください')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'style.css' }));
    expect(screen.queryByText('HTMLの見出しを確認してください')).not.toBeInTheDocument();
    expect(screen.getByText('CSSの色を確認してください')).toBeInTheDocument();
    expect(screen.getByText('ワークスペース全体を確認してください')).toBeInTheDocument();
  });

  it('adapter変更時に旧handleだけを破棄し、unmount時に現handleを破棄する', () => {
    const first = createFakeEditor();
    const second = createFakeEditor();
    const callbacks = { onChange: vi.fn(), onCursorChange: vi.fn() };
    const rendered = renderWithRouter(<Harness adapter={first.adapter} {...callbacks} />);

    rendered.rerender(<Harness adapter={second.adapter} {...callbacks} />);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).not.toHaveBeenCalled();

    rendered.unmount();
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).toHaveBeenCalledTimes(1);
  });
});
