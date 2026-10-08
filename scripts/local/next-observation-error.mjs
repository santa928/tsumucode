/** 教材のHTTP/表示/操作失敗を、採点基盤の障害と区別する。 */
export class NextLessonObservationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NextLessonObservationError';
  }
}
