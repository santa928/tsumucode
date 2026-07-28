/** 正式版と誤認させず、Brand行の高さを増やさない短いβ表示を返す。 */
export function BetaBadge() {
  return (
    <span
      role="img"
      aria-label="ベータ版"
      className="inline-flex shrink-0 items-center rounded-workshop-piece border border-workshop-border bg-workshop-learning px-1.5 py-0.5 text-[0.625rem] font-black leading-none text-workshop-ink"
    >
      β
    </span>
  );
}
