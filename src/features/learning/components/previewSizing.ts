/** 固定Viewportが作業台より十分広い場合だけ、全体を収める縮尺を返す。 */
export function previewFitScale(frameWidth: number, containerWidth: number): number {
  if (
    !Number.isFinite(frameWidth) ||
    !Number.isFinite(containerWidth) ||
    frameWidth <= 0 ||
    containerWidth <= 0 ||
    frameWidth - containerWidth <= 16
  ) {
    return 1;
  }
  return Math.min(1, containerWidth / frameWidth);
}
