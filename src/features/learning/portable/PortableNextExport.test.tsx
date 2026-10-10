/** 非同期準備中の編集・Unmount・再試行で誤った成果物を渡さない。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PortableNextExport } from './PortableNextExport';

const archive = vi.hoisted(() => ({ create: vi.fn(), download: vi.fn() }));
vi.mock('./portableNextArchive', () => ({
  createPortableNextArchive: archive.create,
  downloadPortableNextArchive: archive.download,
}));

beforeEach(() => {
  archive.create.mockReset().mockReturnValue(new Uint8Array([1]));
  archive.download.mockReset();
});

describe('PortableNextExport', () => {
  it('Import前のクリック時点に固定し、準備中の再クリックや別Revisionを混ぜない', async () => {
    const files = { 'index.html': '<h1>クリック時点</h1>', 'styles.css': 'body { color: red; }' };
    const { rerender } = render(
      <PortableNextExport workspaceId="next-ch05-l01-e01" files={files} disabled={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '制作Sourceを持ち出す' }));
    expect(screen.getByRole('button', { name: 'ZIPを作成しています' })).toBeDisabled();
    rerender(
      <PortableNextExport
        workspaceId="next-ch05-l01-e01"
        files={{ 'index.html': '次の編集', 'styles.css': '次のCSS' }}
        disabled={false}
      />,
    );
    await waitFor(() => {
      expect(archive.download).toHaveBeenCalledOnce();
    });
    expect(archive.create).toHaveBeenCalledExactlyOnceWith('next-ch05-l01-e01', files);
    expect(archive.download).toHaveBeenCalledExactlyOnceWith(
      'next-ch05-l01-e01',
      new Uint8Array([1]),
    );
    expect(screen.getByRole('button', { name: '制作Sourceを持ち出す' })).toBeEnabled();
  });

  it('画面を離れた場合はDownloadを開始しない', async () => {
    const { unmount } = render(
      <PortableNextExport
        workspaceId="next-ch05-l01-e01"
        files={{ 'index.html': '', 'styles.css': '' }}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '制作Sourceを持ち出す' }));
    unmount();
    // Importを解決した後でも、古い画面の副作用を起こさない。
    await import('./portableNextArchive');
    expect(archive.create).not.toHaveBeenCalled();
    expect(archive.download).not.toHaveBeenCalled();
  });

  it('失敗の理由を表示して再試行でき、成功風の表示を残さない', async () => {
    archive.create.mockImplementationOnce(() => {
      throw new Error('ソースが100 KiBを超えています。');
    });
    render(
      <PortableNextExport
        workspaceId="next-ch05-l01-e01"
        files={{ 'index.html': '', 'styles.css': '' }}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '制作Sourceを持ち出す' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('100 KiB');
    expect(
      screen.queryByText('ZIPを作成しました。保存先はブラウザで確認してください。'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '制作Sourceを持ち出す' }));
    await waitFor(() => {
      expect(archive.download).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
