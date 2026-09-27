/** 説明・コード・結果を著者の記述順で描き、種類による分断を作らない。 */
import type { Ref } from 'react';
import type { Slide } from '../../../core/content/types';
import { SlideBlocks } from './SlideBlocks';
import { SlideCodeReference } from './SlideCodeReference';

export interface SlideStageProps {
  readonly slide: Slide;
  readonly baseUrl: string;
  readonly codeReference?: Slide | undefined;
  readonly titleRef?: Ref<HTMLHeadingElement>;
}

/** 見出しから例・結果・練習まで、PCと狭幅で同じ読み順を保持する。 */
export function SlideStage({ slide, baseUrl, titleRef, codeReference }: SlideStageProps) {
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
      <div className="tc-slide-stage-body tc-slide-author-order">
        <SlideCodeReference slide={codeReference} baseUrl={baseUrl} />
        <SlideBlocks
          blocks={slide.blocks}
          assets={slide.assets}
          baseUrl={baseUrl}
          density="compact"
        />
      </div>
    </section>
  );
}
