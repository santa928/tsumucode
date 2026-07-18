import { describe, expect, it, vi } from 'vitest';
import { downloadProgressJson, type ProgressDownloadDependencies } from './progressDownload';

/** DOM副作用を観測できるdownload依存を作る。 */
function createDependencies(click: () => void = vi.fn()) {
  const anchor = {
    href: '',
    download: '',
    click: vi.fn(click),
  };
  const dependencies = {
    createObjectUrl: vi.fn(() => 'blob:progress'),
    revokeObjectUrl: vi.fn(),
    createAnchor: vi.fn(() => anchor),
    appendAnchor: vi.fn(),
    removeAnchor: vi.fn(),
    now: () => new Date('2026-07-16T08:00:00.000Z'),
  } satisfies ProgressDownloadDependencies;
  return { anchor, dependencies };
}

describe('downloadProgressJson', () => {
  it('日付付きJSONを一時Anchorで保存し、Object URLとAnchorを必ず片付ける', () => {
    const { anchor, dependencies } = createDependencies();

    downloadProgressJson('{"ok":true}', dependencies);

    expect(dependencies.createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.href).toBe('blob:progress');
    expect(anchor.download).toBe('tsumucode-progress-2026-07-16.json');
    expect(dependencies.appendAnchor).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(dependencies.removeAnchor).toHaveBeenCalledWith(anchor);
    expect(dependencies.revokeObjectUrl).toHaveBeenCalledWith('blob:progress');
  });

  it('Browserのclickが失敗してもObject URLとAnchorを片付ける', () => {
    const { anchor, dependencies } = createDependencies(() => {
      throw new Error('internal browser detail');
    });

    expect(() => {
      downloadProgressJson('{}', dependencies);
    }).toThrow('internal browser detail');
    expect(dependencies.removeAnchor).toHaveBeenCalledWith(anchor);
    expect(dependencies.revokeObjectUrl).toHaveBeenCalledWith('blob:progress');
  });

  it('一時Anchorを作れない場合も作成済みObject URLを片付ける', () => {
    const { dependencies } = createDependencies();
    dependencies.createAnchor.mockImplementationOnce(() => {
      throw new Error('anchor unavailable');
    });

    expect(() => {
      downloadProgressJson('{}', dependencies);
    }).toThrow('anchor unavailable');
    expect(dependencies.removeAnchor).not.toHaveBeenCalled();
    expect(dependencies.revokeObjectUrl).toHaveBeenCalledWith('blob:progress');
  });
});
