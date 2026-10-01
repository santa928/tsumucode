import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureCourse, fixtureCourseIndex } from '../../../tests/fixtures/course';
import { ReadingControls } from './ReadingControls';

const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
const position = {
  scope: 'library' as const,
  courseId: fixtureCourse.id,
  lessonId: lesson.id,
  slideId: lesson.slides[0]!.id,
  mode: 'continuous' as const,
};

afterEach(() => vi.unstubAllGlobals());

describe('読書位置が変わる間のURLコピー', () => {
  it('Clipboard拒否の間に位置が変わっても、現在のURLを選択する案内を残す', async () => {
    let rejectCopy!: (reason: Error) => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCopy = reject;
        }),
    );
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, {
        clipboard: { value: { writeText } },
      }),
    );
    const view = render(
      <ReadingControls
        course={fixtureCourseIndex}
        lesson={lesson}
        position={position}
        recordPosition={false}
      />,
      { wrapper: MemoryRouter },
    );
    fireEvent.click(screen.getByRole('button', { name: '読書位置のURLをコピー' }));
    view.rerender(
      <ReadingControls
        course={fixtureCourseIndex}
        lesson={lesson}
        position={{ ...position, slideId: 'next-slide' }}
        recordPosition={false}
      />,
    );
    await act(async () => {
      rejectCopy(new Error('denied'));
    });
    expect(screen.getByText('URLを選択してコピーしてください')).toBeVisible();
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: '読書位置のURL' }).value,
    ).toContain('slide=next-slide');
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('URLをコピーしました')).not.toBeInTheDocument();
  });

  it('コピーに成功した古い位置の案内は、現在のURLへ表示しない', async () => {
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, {
        clipboard: { value: { writeText: vi.fn().mockResolvedValue(undefined) } },
      }),
    );
    const view = render(
      <ReadingControls
        course={fixtureCourseIndex}
        lesson={lesson}
        position={position}
        recordPosition={false}
      />,
      { wrapper: MemoryRouter },
    );
    fireEvent.click(screen.getByRole('button', { name: '読書位置のURLをコピー' }));
    expect(await screen.findByText('URLをコピーしました')).toBeVisible();
    view.rerender(
      <ReadingControls
        course={fixtureCourseIndex}
        lesson={lesson}
        position={{ ...position, slideId: 'next-slide' }}
        recordPosition={false}
      />,
    );
    expect(screen.queryByText('URLをコピーしました')).not.toBeInTheDocument();
  });
});
