import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readReadingState,
  saveReadingPosition,
  setExerciseForLater,
  READING_STORAGE_KEY,
} from './readingState';

const position = {
  scope: 'library' as const,
  courseId: 'javascript',
  lessonId: 'javascript-ch03-l05',
  slideId: 'javascript-ch03-l05-s03',
  mode: 'continuous' as const,
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('読書専用の端末保存', () => {
  it('Courseごとの最新位置とあとで試すを往復し、他の学習保存を書き換えない', () => {
    localStorage.setItem('tsumucode-progress', '既存の進捗');
    expect(saveReadingPosition(position)).toBe(true);
    expect(
      saveReadingPosition({
        ...position,
        courseId: 'html-css',
        lessonId: 'html-css-ch00-l01',
        slideId: 'html-css-ch00-l01-s02',
        mode: 'slides',
      }),
    ).toBe(true);
    expect(
      setExerciseForLater(
        {
          scope: position.scope,
          courseId: position.courseId,
          lessonId: position.lessonId,
          exerciseId: 'javascript-ch03-l05-e01',
        },
        true,
      ),
    ).toBe(true);
    expect(saveReadingPosition({ ...position, slideId: 'javascript-ch03-l05-s04' })).toBe(true);
    const read = readReadingState();
    expect(read.available).toBe(true);
    expect(read.state.positions).toHaveLength(2);
    expect(read.state.positions.find((item) => item.courseId === 'javascript')?.slideId).toBe(
      'javascript-ch03-l05-s04',
    );
    expect(read.state.later).toHaveLength(1);
    expect(localStorage.getItem('tsumucode-progress')).toBe('既存の進捗');
    expect(setExerciseForLater(read.state.later[0]!, false)).toBe(true);
    expect(readReadingState().state.later).toEqual([]);
  });

  it('破損値・未知version・不正なIDは読書状態へ採用しない', () => {
    for (const value of [
      '{',
      JSON.stringify({ version: 2, positions: [position], later: [] }),
      JSON.stringify({
        version: 1,
        positions: [{ ...position, slideId: '../elsewhere' }],
        later: [],
      }),
    ]) {
      localStorage.setItem(READING_STORAGE_KEY, value);
      expect(readReadingState()).toEqual({
        available: true,
        invalid: true,
        state: { version: 1, positions: [], later: [] },
      });
    }
  });

  it('通常Libraryと有限試用の位置と印を互いに上書きしない', () => {
    saveReadingPosition(position);
    saveReadingPosition({ ...position, scope: 'pilot', slideId: 'javascript-ch03-l05-s01' });
    const target = {
      scope: position.scope,
      courseId: position.courseId,
      lessonId: position.lessonId,
      exerciseId: 'javascript-ch03-l05-e01',
    };
    setExerciseForLater(target, true);
    setExerciseForLater({ ...target, scope: 'pilot' }, true);
    setExerciseForLater({ ...target, scope: 'pilot' }, false);
    expect(readReadingState().state.positions).toEqual([
      position,
      { ...position, scope: 'pilot', slideId: 'javascript-ch03-l05-s01' },
    ]);
    expect(readReadingState().state.later).toEqual([target]);
  });

  it('Storage getter/read/writeが拒否されても投げず、保存不可だけを返す', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readReadingState().available).toBe(false);
    expect(saveReadingPosition(position)).toBe(false);
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(saveReadingPosition(position)).toBe(false);
    vi.restoreAllMocks();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('disabled');
    });
    expect(readReadingState().available).toBe(false);
  });
});
