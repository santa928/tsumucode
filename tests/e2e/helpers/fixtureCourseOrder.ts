/** Compilerを使う演習群を先に登録し、件数shardの後半への高負荷集中を避ける。 */
export function orderFixtureCourses<T extends { readonly index: { readonly runnerId: string } }>(
  courses: readonly T[],
): T[] {
  const compiled = new Set(['typescript', 'react', 'tailwind']);
  // Node24のstable sortで、同じ負荷区分のCourse／演習順と入力objectを保つ。
  return [...courses].sort(
    (left, right) =>
      Number(compiled.has(right.index.runnerId)) - Number(compiled.has(left.index.runnerId)),
  );
}
