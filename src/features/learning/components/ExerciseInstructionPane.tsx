/** Exerciseの全体像を残しつつ、現在の構造化Stepだけを詳しく表示する。 */
import { useId } from 'react';
import type { AssetRef, ExerciseStep, SlideBlock } from '../../../core/content/types';
import { SlideBlocks } from './SlideBlocks';

export interface ExerciseInstructionPaneProps {
  readonly steps: readonly ExerciseStep[];
  readonly activeStepId: string | undefined;
  readonly onStepChange: (stepId: string) => void;
  readonly fallbackInstructions?: readonly SlideBlock[];
  readonly fallbackAssets?: readonly AssetRef[];
  readonly baseUrl?: string;
}

/** Structured Step移行前のExerciseだけ、既存説明をRead-onlyで表示する。 */
function LegacyInstructionFallback({
  instructions,
  assets,
  baseUrl,
}: {
  readonly instructions: readonly SlideBlock[];
  readonly assets: readonly AssetRef[];
  readonly baseUrl: string;
}) {
  return (
    <section aria-label="演習の手順" className="rounded-workshop-md bg-workshop-surface p-4">
      <h2 className="text-lg font-black">今回の手順</h2>
      <div className="mt-3">
        {instructions.length > 0 ? (
          <SlideBlocks blocks={instructions} assets={assets} baseUrl={baseUrl} />
        ) : (
          <p className="text-workshop-muted">手順を読み込めませんでした。</p>
        )}
      </div>
    </section>
  );
}

/** Step選択とfile・target・change・observeの現在地を1 Paneへ描画する。 */
export function ExerciseInstructionPane({
  steps,
  activeStepId,
  onStepChange,
  fallbackInstructions = [],
  fallbackAssets = [],
  baseUrl = '/',
}: ExerciseInstructionPaneProps) {
  const panelId = useId();
  if (steps.length === 0) {
    return (
      <LegacyInstructionFallback
        instructions={fallbackInstructions}
        assets={fallbackAssets}
        baseUrl={baseUrl}
      />
    );
  }

  const activeStep = steps.find(({ id }) => id === activeStepId) ?? steps[0];
  if (activeStep === undefined) throw new Error('Exercise Stepを選択できませんでした。');

  return (
    <section aria-label="演習の手順" className="min-w-0">
      <ol className="grid list-none gap-2 p-0" aria-label="手順一覧">
        {steps.map((step, index) => {
          const active = step.id === activeStep.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                aria-expanded={active}
                aria-controls={active ? panelId : undefined}
                className={`grid min-h-11 w-full grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 rounded-workshop-sm border px-2 py-2 text-left font-bold ${
                  active
                    ? 'border-workshop-primary bg-workshop-learning shadow-[var(--tc-shadow-piece)]'
                    : 'border-workshop-border bg-workshop-surface hover:bg-workshop-workbench'
                }`}
                onClick={() => {
                  onStepChange(step.id);
                }}
              >
                <span
                  aria-hidden="true"
                  className="grid size-8 place-items-center rounded-workshop-piece bg-workshop-raised"
                >
                  {index + 1}
                </span>
                <span>{`手順 ${String(index + 1)}：${step.change}`}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div
        id={panelId}
        className="mt-3 rounded-workshop-md border border-workshop-border bg-workshop-raised p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-black text-workshop-complete">現在の手順</p>
          <code className="rounded-workshop-sm bg-workshop-ink px-2 py-1 font-mono text-sm text-workshop-on-primary">
            {activeStep.file}
          </code>
        </div>
        <dl className="mt-4 grid gap-x-3 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="font-black text-workshop-complete">探す場所</dt>
          <dd>{activeStep.target}</dd>
          <dt className="font-black text-workshop-complete">変更すること</dt>
          <dd>{activeStep.change}</dd>
          <dt className="font-black text-workshop-complete">確認すること</dt>
          <dd>{activeStep.observe}</dd>
        </dl>
      </div>
    </section>
  );
}
