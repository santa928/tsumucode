/** 演習の保存とは独立した、このoriginだけの読書位置と後で試す印。 */
export const READING_STORAGE_KEY = 'tsumucode-reading-v1';

export type ReadingScope = 'library' | 'pilot';

export interface ReadingPosition {
  readonly scope: ReadingScope;
  readonly courseId: string;
  readonly lessonId: string;
  readonly slideId: string;
  readonly mode: 'slides' | 'continuous';
}
export interface LaterExercise {
  readonly scope: ReadingScope;
  readonly courseId: string;
  readonly lessonId: string;
  readonly exerciseId: string;
}
export interface ReadingState {
  readonly version: 1;
  readonly positions: readonly ReadingPosition[];
  readonly later: readonly LaterExercise[];
}
export interface ReadingStateResult {
  readonly state: ReadingState;
  readonly available: boolean;
  readonly invalid: boolean;
}

/** 破損値や保存不可でも読む操作には空の状態を提供する。 */
function emptyState(): ReadingState {
  return { version: 1, positions: [], later: [] };
}

/** URLの構成要素に使える教材IDだけを許可し、所属は利用先のoutlineで照合する。 */
function isContentId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/u.test(value);
}

/** 外部保存値をプロパティ参照前に絞り込む。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 表示に必要な識別子とmodeだけを受け入れる。 */
function isPosition(value: unknown): value is ReadingPosition {
  return (
    isRecord(value) &&
    (value['scope'] === 'library' || value['scope'] === 'pilot') &&
    isContentId(value['courseId']) &&
    isContentId(value['lessonId']) &&
    isContentId(value['slideId']) &&
    (value['mode'] === 'slides' || value['mode'] === 'continuous')
  );
}

/** 後で試す印も教材ID以外の実行状態を保持しない。 */
function isLaterExercise(value: unknown): value is LaterExercise {
  return (
    isRecord(value) &&
    (value['scope'] === 'library' || value['scope'] === 'pilot') &&
    isContentId(value['courseId']) &&
    isContentId(value['lessonId']) &&
    isContentId(value['exerciseId'])
  );
}

/** Storage自体の取得拒否、壊れたJSON、未知versionを読書失敗にしない。 */
export function readReadingState(): ReadingStateResult {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(READING_STORAGE_KEY);
  } catch {
    return { state: emptyState(), available: false, invalid: false };
  }
  if (raw === null) return { state: emptyState(), available: true, invalid: false };
  try {
    const value: unknown = JSON.parse(raw);
    if (
      isRecord(value) &&
      value['version'] === 1 &&
      Array.isArray(value['positions']) &&
      value['positions'].length <= 100 &&
      value['positions'].every(isPosition) &&
      Array.isArray(value['later']) &&
      value['later'].length <= 100 &&
      value['later'].every(isLaterExercise)
    ) {
      return {
        state: {
          version: 1,
          positions: value['positions'].map(({ scope, courseId, lessonId, slideId, mode }) => ({
            scope,
            courseId,
            lessonId,
            slideId,
            mode,
          })),
          later: value['later'].map(({ scope, courseId, lessonId, exerciseId }) => ({
            scope,
            courseId,
            lessonId,
            exerciseId,
          })),
        },
        available: true,
        invalid: false,
      };
    }
  } catch {
    /* このキーの破損だけを無視し、他の保存領域は変更しない。 */
  }
  return { state: emptyState(), available: true, invalid: true };
}

/** 最後に読んだ状態を読み直してから、この専用キーだけを書き込む。 */
function updateReadingState(update: (state: ReadingState) => ReadingState): boolean {
  const read = readReadingState();
  if (!read.available) return false;
  try {
    window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(update(read.state)));
    return true;
  } catch {
    return false;
  }
}

/** Courseごとの位置を置き換える。演習の合否・再開位置・下書きにはアクセスしない。 */
export function saveReadingPosition(position: ReadingPosition): boolean {
  return updateReadingState((state) => ({
    ...state,
    positions: [
      ...state.positions.filter(
        (item) => item.courseId !== position.courseId || item.scope !== position.scope,
      ),
      position,
    ].slice(-100),
  }));
}

/** 利用者が選んだ演習だけを印にし、コードや端末間同期の状態は保存しない。 */
export function setExerciseForLater(exercise: LaterExercise, selected: boolean): boolean {
  return updateReadingState((state) => {
    const remaining = state.later.filter(
      (item) =>
        item.scope !== exercise.scope ||
        item.courseId !== exercise.courseId ||
        item.lessonId !== exercise.lessonId ||
        item.exerciseId !== exercise.exerciseId,
    );
    return { ...state, later: (selected ? [...remaining, exercise] : remaining).slice(-100) };
  });
}
