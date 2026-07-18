import { StackedCard } from '../../../design-system/components/StackedCard';
import type {
  ValidationCheck,
  ValidationResult,
  ValidationStatus,
} from '../../../core/validation/contracts';

interface FeedbackPanelProps {
  readonly result: ValidationResult | undefined;
  readonly onRevealNextHint: () => void;
  readonly onReviewSlide: (slideId: string) => void;
}

const STATUS_COPY: Record<
  ValidationStatus,
  { readonly heading: string; readonly description: string; readonly className: string }
> = {
  pass: {
    heading: 'できました',
    description: '必要なピースをすべて積めました。',
    className: 'border-workshop-complete',
  },
  incomplete: {
    heading: 'あと一歩',
    description: '次に積む内容を一つずつ確認しましょう。',
    className: 'border-workshop-learning',
  },
  'code-error': {
    heading: 'コードを確認しよう',
    description: 'プレビューを動かす前に、次の箇所を確認しましょう。',
    className: 'border-workshop-correction',
  },
  'system-error': {
    heading: 'TsumuCodeで問題が起きました',
    description: '下書きは画面に残っています。もう一度試すか、進捗を書き出してください。',
    className: 'border-workshop-correction',
  },
};

/** requiredかつ未達のcheckを入力順でrequirementごとに1件へ集約する。 */
function selectPrimaryChecks(checks: readonly ValidationCheck[]): readonly ValidationCheck[] {
  const seenRequirementIds = new Set<string>();
  const primaryChecks: ValidationCheck[] = [];

  for (const check of checks) {
    if (
      !check.required ||
      check.passed ||
      check.requirementPassed ||
      seenRequirementIds.has(check.requirementId)
    ) {
      continue;
    }

    seenRequirementIds.add(check.requirementId);
    primaryChecks.push(check);

    if (primaryChecks.length === 3) {
      break;
    }
  }

  return primaryChecks;
}

/** 判定状態を学習者向け説明と次の操作へ変換して表示する。 */
export function FeedbackPanel({ result, onRevealNextHint, onReviewSlide }: FeedbackPanelProps) {
  if (result === undefined) {
    return (
      <StackedCard as="section" aria-label="判定結果">
        <p className="text-workshop-muted">コードを書いたら「判定する」を押してください。</p>
      </StackedCard>
    );
  }

  const copy = STATUS_COPY[result.status];
  const primaryChecks = result.status === 'incomplete' ? selectPrimaryChecks(result.checks) : [];

  return (
    <StackedCard
      as="section"
      aria-label="判定結果"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`border-2 ${copy.className}`}
    >
      <h2 className="text-xl font-black">{copy.heading}</h2>
      <p className="mt-2 text-workshop-muted">{copy.description}</p>

      {result.status === 'incomplete' && primaryChecks.length > 0 ? (
        <ol className="mt-5 space-y-5">
          {primaryChecks.map((check) => {
            const relatedSlideId = check.relatedSlideId;

            return (
              <li key={check.requirementId} className="rounded-workshop-md bg-workshop-raised p-4">
                <h3 className="font-black">{check.label}</h3>
                <p className="mt-2 text-workshop-muted">{check.message}</p>
                <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                  <dt className="font-bold text-workshop-complete">期待</dt>
                  <dd>{check.expected}</dd>
                  <dt className="font-bold text-workshop-correction">現在</dt>
                  <dd>{check.actual}</dd>
                </dl>
                <p className="mt-3">{check.nextAction}</p>
                {check.hintId !== undefined || relatedSlideId !== undefined ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {check.hintId !== undefined ? (
                      <button
                        type="button"
                        aria-label={`次のヒントを見る：${check.label}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary transition-colors duration-[var(--tc-motion-fast)] hover:bg-[var(--tc-color-primary-hover)]"
                        onClick={onRevealNextHint}
                      >
                        次のヒントを見る
                      </button>
                    ) : null}
                    {relatedSlideId !== undefined ? (
                      <button
                        type="button"
                        aria-label={`関連スライドを見直す：${check.label}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-workshop-md border-2 border-workshop-primary bg-workshop-surface px-5 py-3 font-bold text-workshop-primary hover:bg-workshop-workbench"
                        onClick={() => {
                          onReviewSlide(relatedSlideId);
                        }}
                      >
                        関連スライドを見直す
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {result.status === 'code-error' && result.diagnostics.length > 0 ? (
        <ol className="mt-5 space-y-3" aria-label="確認するコード診断">
          {result.diagnostics.slice(0, 3).map((diagnostic, index) => (
            <li
              key={`${diagnostic.code}-${diagnostic.file ?? ''}-${String(diagnostic.line ?? '')}-${String(diagnostic.column ?? '')}-${diagnostic.message}-${String(index)}`}
              className="rounded-workshop-md bg-workshop-raised p-4"
            >
              {diagnostic.learnerMessage}
            </li>
          ))}
        </ol>
      ) : null}
    </StackedCard>
  );
}
