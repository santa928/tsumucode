interface HomeJavaScriptBudget {
  readonly maximumBytes: number;
  readonly baselineBytes: number;
  readonly growthWarningBytes: number;
}

/** Home全体の上限は拒否し、過去版からの増分だけの超過は診断用警告として返す。 */
export function checkHomeJavaScriptBudget(
  currentBytes: number,
  budget: HomeJavaScriptBudget,
): readonly string[] {
  if (currentBytes > budget.maximumBytes) {
    throw new Error(
      `Home初期JSが上限を超えています: ${String(currentBytes)} > ${String(budget.maximumBytes)} bytes (gzip)`,
    );
  }
  const growth = Math.max(0, currentBytes - budget.baselineBytes);
  return growth > budget.growthWarningBytes
    ? [
        `Home初期JSの増分を確認してください: ${String(growth)} > ${String(budget.growthWarningBytes)} bytes (gzip)。全体 ${String(currentBytes)} / ${String(budget.maximumBytes)} bytes。`,
      ]
    : [];
}
