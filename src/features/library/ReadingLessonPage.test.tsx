import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureCourse, fixtureCourseIndex } from '../../../tests/fixtures/course';
import type { Lesson } from '../../core/content/types';
import { ReadingLessonPage } from './ReadingLessonPage';
import { readReadingState, READING_STORAGE_KEY } from './readingState';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem(READING_STORAGE_KEY);
});

/** 描画・位置判定・保存の予約を順に進め、保存前の値で成功としない。 */
function controlAnimationFrames() {
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    sequence += 1;
    frames.set(sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return async () => {
    for (let index = 0; index < 4; index += 1) {
      await act(async () => {
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback(0);
      });
    }
  };
}

/** 実ページを3節で表示し、URL復元後の小数位置をDOM境界で与える。 */
async function renderAtBoundary(thirdTop: number, viewportHeight: number) {
  localStorage.removeItem(READING_STORAGE_KEY);
  vi.stubGlobal('innerHeight', viewportHeight);
  expect(window.innerHeight).toBe(viewportHeight);
  const flush = controlAnimationFrames();
  const source = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
  const lesson: Lesson = {
    ...structuredClone(source),
    slides: ['first', 'second', 'third'].map((id) => ({
      ...structuredClone(source.slides[0]!),
      id,
      title: id,
      assets: [],
      blocks: [{ type: 'paragraph' as const, text: `${id}の本文` }],
    })),
  };
  const router = createMemoryRouter(
    [
      {
        path: '/read',
        loader: () => ({ course: fixtureCourseIndex, lesson, pilot: false }),
        HydrateFallback: () => <p>読書を準備中</p>,
        element: <ReadingLessonPage />,
      },
    ],
    { initialEntries: ['/read?slide=third'] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: /^third$/u });
  for (const [id, top] of [
    ['first', -1000],
    ['second', -500],
    ['third', thirdTop],
  ] as const) {
    const node = document.querySelector<HTMLElement>(`[data-reading-section="${id}"]`)!;
    node.style.scrollMarginBlockStart = '144px';
    node.scrollIntoView = vi.fn();
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 390, 800));
  }
  await flush();
  fireEvent.scroll(window);
  await flush();
}

describe('通読の保存位置とスクロール境界', () => {
  it.each([
    { height: 400, top: 144, expected: 'third' },
    { height: 400, top: 144.0625, expected: 'third' },
    { height: 400, top: 144.5, expected: 'third' },
    { height: 400, top: 144.984375, expected: 'third' },
    { height: 400, top: 145, expected: 'third' },
    { height: 400, top: 145.015625, expected: 'second' },
    { height: 400, top: 146, expected: 'second' },
    { height: 844, top: 169.5, expected: 'third' },
    { height: 844, top: 170.8, expected: 'second' },
  ])('高さ$height・第3節top=$topでは$expectedを保存する', async ({ height, top, expected }) => {
    await renderAtBoundary(top, height);
    expect(readReadingState().state.positions[0]?.slideId).toBe(expected);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '読書位置のURL' }).value).toMatch(
      new RegExp(`slide=${expected}$`, 'u'),
    );
  });
});
