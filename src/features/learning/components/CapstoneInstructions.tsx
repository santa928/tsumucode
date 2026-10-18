/** CapstoneのBriefを先に示し、補助資料は明示的な展開後だけ描画する。 */
import { useId, useState, type ReactNode } from 'react';
import type { AssetRef, SlideBlock } from '../../../core/content/types';
import { SlideBlocks } from './SlideBlocks';

interface CapstoneInstructionsProps {
  readonly brief: readonly SlideBlock[];
  readonly guide: readonly SlideBlock[];
  readonly assets: readonly AssetRef[];
  readonly baseUrl: string;
  readonly children: ReactNode;
}

/** 補助の開示は画面内だけに留め、再訪時はBriefから読み始められるようにする。 */
export function CapstoneInstructions({
  brief,
  guide,
  assets,
  baseUrl,
  children,
}: CapstoneInstructionsProps) {
  const supportId = useId();
  const [showSupport, setShowSupport] = useState(false);

  return (
    <>
      <section className="tc-exercise-project-brief" aria-label="制作ブリーフ">
        <SlideBlocks blocks={brief} assets={assets} baseUrl={baseUrl} />
      </section>
      <div className="tc-exercise-project-brief">
        <button
          type="button"
          className="min-h-11 text-left font-black underline underline-offset-4"
          aria-expanded={showSupport}
          aria-controls={supportId}
          onClick={() => setShowSupport((shown) => !shown)}
        >
          {showSupport ? '制作の補助を閉じる' : '制作の補助を見る'}
        </button>
        <div id={supportId} hidden={!showSupport}>
          {showSupport ? (
            <div className="space-y-6">
              <SlideBlocks blocks={guide} assets={assets} baseUrl={baseUrl} />
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
