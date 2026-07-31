/** LearningPath向けの表示文言を状態から組み立てる。 */
import type { LearningPathProgressSummary } from '../progress/learningPathProgress';

/** Path状態を主要CTAの日本語へ変換する。 */
export function learningPathActionLabel(
  title: string,
  status: LearningPathProgressSummary['status'],
): string {
  switch (status) {
    case 'not-started':
      return `「${title}」を最初から始める`;
    case 'in-progress':
      return `「${title}」のつづきから`;
    case 'complete':
      return `「${title}」を見直す`;
  }
}
