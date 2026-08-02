/** 現在画面を阻害しない隣接Lessonの任意先読み方針を提供する。 */
import { courseLessonOutlines } from './selectors';
import type { CourseIndex } from './types';

export interface AdjacentLessonPrefetchInput {
  readonly course: CourseIndex;
  readonly lessonId: string;
  readonly visibilityState: DocumentVisibilityState;
  readonly saveData: boolean;
  readonly schedule: (task: () => Promise<void>) => Promise<void>;
  readonly prefetch: (lessonId: string) => Promise<void>;
}

/** Course表示順で現在Lessonの直前・直後を返し、現在または不明IDは含めない。 */
export function adjacentLessonIds(course: CourseIndex, lessonId: string): readonly string[] {
  const ids = courseLessonOutlines(course).map(({ id }) => id);
  const current = ids.indexOf(lessonId);
  if (current < 0) return [];
  return [ids[current - 1], ids[current + 1]].filter(
    (candidate): candidate is string => candidate !== undefined,
  );
}

/** visibleかつData節約外の時だけ前後最大2 Lessonを任意取得し、失敗を画面へ伝播しない。 */
export async function scheduleAdjacentLessonPrefetch(
  input: AdjacentLessonPrefetchInput,
): Promise<void> {
  if (input.visibilityState !== 'visible' || input.saveData) return;
  const lessonIds = adjacentLessonIds(input.course, input.lessonId).slice(0, 2);
  if (lessonIds.length === 0) return;
  try {
    await input.schedule(async () => {
      await Promise.allSettled(lessonIds.map((lessonId) => input.prefetch(lessonId)));
    });
  } catch {
    // 任意先読みのschedule自体が失敗しても現在画面と実移動時の通常取得を維持する。
  }
}
