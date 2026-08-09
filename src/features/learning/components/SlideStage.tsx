/** Slide MetadataのLayout契約を、1画面内の説明・Visual領域へ投影する。 */
import type { Ref } from 'react';
import type { Slide, SlideBlock } from '../../../core/content/types';
import { SlideBlocks } from './SlideBlocks';

export interface SlideStageProps {
  readonly slide: Slide;
  readonly baseUrl: string;
  readonly titleRef?: Ref<HTMLHeadingElement>;
}

const LAYOUT_CLASS = {
  explanation: 'tc-slide-layout-explanation',
  'code-preview': 'tc-slide-layout-code-preview',
  comparison: 'tc-slide-layout-comparison',
  checkpoint: 'tc-slide-layout-checkpoint',
} as const;

interface StageBlocks {
  readonly copy: readonly SlideBlock[];
  readonly visual: readonly SlideBlock[];
  readonly split: boolean;
}

/** Layoutに応じてBlockを説明領域とCode／Visual領域へ一度だけ振り分ける。 */
function partitionBlocks(slide: Slide): StageBlocks {
  if (slide.layout === 'explanation' || slide.layout === 'checkpoint') {
    return { copy: slide.blocks, visual: [], split: false };
  }

  const visual = slide.blocks.filter((block) => block.type === 'code' || block.type === 'image');
  if (visual.length > 0) {
    return {
      copy: slide.blocks.filter((block) => block.type !== 'code' && block.type !== 'image'),
      visual,
      split: true,
    };
  }

  if (slide.layout === 'comparison') {
    const midpoint = Math.ceil(slide.blocks.length / 2);
    return {
      copy: slide.blocks.slice(0, midpoint),
      visual: slide.blocks.slice(midpoint),
      split: true,
    };
  }
  return { copy: slide.blocks, visual: [], split: true };
}

/** Slide見出しと全Blockを、Layout別の1枚の設計シートへ描画する。 */
export function SlideStage({ slide, baseUrl, titleRef }: SlideStageProps) {
  const blocks = partitionBlocks(slide);
  const visualImages = blocks.visual.filter((block) => block.type === 'image');
  const visualDetails = blocks.visual.filter((block) => block.type !== 'image');
  return (
    <section
      data-slide-card
      data-slide-id={slide.id}
      data-slide-layout={slide.layout}
      data-testid="slide-stage"
      className="tc-slide-stage"
    >
      <header className="tc-slide-stage-heading">
        <h1 id="slide-title" ref={titleRef} tabIndex={-1}>
          {slide.title}
        </h1>
      </header>
      <div className={`tc-slide-stage-body ${LAYOUT_CLASS[slide.layout]}`}>
        <div className="tc-slide-stage-copy" data-testid="slide-copy">
          <SlideBlocks
            blocks={blocks.copy}
            assets={slide.assets}
            baseUrl={baseUrl}
            density="compact"
          />
        </div>
        {blocks.split ? (
          <div
            className="tc-slide-stage-visual"
            data-has-detail={visualDetails.length > 0}
            data-has-image={visualImages.length > 0}
            data-testid="slide-visual"
          >
            {blocks.visual.length > 0 ? (
              <>
                {visualImages.length > 0 ? (
                  <SlideBlocks
                    blocks={visualImages}
                    assets={slide.assets}
                    baseUrl={baseUrl}
                    density="compact"
                  />
                ) : null}
                {visualDetails.length > 0 ? (
                  <SlideBlocks
                    blocks={visualDetails}
                    assets={slide.assets}
                    baseUrl={baseUrl}
                    density="compact"
                  />
                ) : null}
              </>
            ) : (
              <p className="tc-slide-stage-migration-note">
                この設計図のVisual例は教材改訂で追加されます。説明は左側ですべて確認できます。
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
