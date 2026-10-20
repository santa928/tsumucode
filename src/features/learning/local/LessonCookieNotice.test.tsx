import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonCookieNotice } from './LessonCookieNotice';

describe('限定Cookieの別タブ案内', () => {
  it('対象2教材だけで、閉じた案内から同じrunを安全に開ける', () => {
    for (const workspaceId of ['next-ch04-l01-e01', 'next-ch04-l02-e01']) {
      const previewUrl = `http://run.localhost:4175/w/${workspaceId}/run/`;
      const view = render(<LessonCookieNotice workspaceId={workspaceId} previewUrl={previewUrl} />);
      const link = screen.getByRole('link', {
        name: 'Cookie確認用にPreviewを別タブで開く',
        hidden: true,
      });
      expect(link.closest('details')).not.toHaveAttribute('open');
      expect(link).toHaveAttribute('href', previewUrl);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      view.unmount();
    }
  });
  it('他のNext教材やViteにCookie対応を表示しない', () => {
    const { container } = render(
      <LessonCookieNotice
        workspaceId="next-ch01-l01-e01"
        previewUrl="http://run.localhost:4175/"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
