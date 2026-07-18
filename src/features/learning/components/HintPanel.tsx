import { StackedCard } from '../../../design-system/components/StackedCard';

export interface HintViewModel {
  readonly id: string;
  readonly level: 1 | 2 | 3;
  readonly title: string;
  readonly text: string;
}

interface HintPanelProps {
  readonly hints: readonly HintViewModel[];
  readonly revealedHintIds: readonly string[];
  readonly onRevealNext: () => void;
}

const HINT_LEVEL_LABEL: Record<HintViewModel['level'], string> = {
  1: '観察ポイント',
  2: '考え方',
  3: '差分解説',
};

/** Content Schemaのlevel順へ並べ、保存値から連続して開示済みのprefixを求める。 */
function selectHintProgress(
  hints: readonly HintViewModel[],
  revealedHintIds: readonly string[],
): {
  readonly revealedHints: readonly HintViewModel[];
  readonly nextHint?: HintViewModel;
} {
  const orderedHints = [...hints].sort((left, right) => left.level - right.level);
  const revealedIds = new Set(revealedHintIds);
  const nextIndex = orderedHints.findIndex((hint) => !revealedIds.has(hint.id));

  if (nextIndex === -1) {
    return { revealedHints: orderedHints };
  }

  const nextHint = orderedHints[nextIndex];
  if (nextHint === undefined) {
    return { revealedHints: orderedHints };
  }

  return {
    revealedHints: orderedHints.slice(0, nextIndex),
    nextHint,
  };
}

/** 3段階Hintをlevel順の連続prefixとして表示し、次の1件だけを開示操作へ接続する。 */
export function HintPanel({ hints, revealedHintIds, onRevealNext }: HintPanelProps) {
  const { revealedHints, nextHint } = selectHintProgress(hints, revealedHintIds);

  return (
    <StackedCard as="section" aria-label="ヒント" className="border-2 border-workshop-learning">
      <h2 className="text-xl font-black">ヒント</h2>
      <div className="mt-4 space-y-3">
        {revealedHints.map((hint) => (
          <details key={hint.id} open className="rounded-workshop-md bg-workshop-raised p-4">
            <summary className="font-black text-workshop-complete">
              {HINT_LEVEL_LABEL[hint.level]}
            </summary>
            <h3 className="mt-3 font-bold">{hint.title}</h3>
            <p className="mt-2 text-workshop-muted">{hint.text}</p>
          </details>
        ))}
      </div>

      {nextHint !== undefined ? (
        <button
          type="button"
          aria-label={`ヒント${String(nextHint.level)}を見る：${HINT_LEVEL_LABEL[nextHint.level]}`}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary transition-colors duration-[var(--tc-motion-fast)] hover:bg-[var(--tc-color-primary-hover)]"
          onClick={onRevealNext}
        >
          ヒント{nextHint.level}を見る：{HINT_LEVEL_LABEL[nextHint.level]}
        </button>
      ) : hints.length > 0 ? (
        <p className="mt-4 font-bold text-workshop-complete">3つのヒントを確認しました。</p>
      ) : (
        <p className="mt-4 text-workshop-muted">利用できるヒントはありません。</p>
      )}
    </StackedCard>
  );
}
