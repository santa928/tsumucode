/** 読書画面と演習の見直しDrawerで、同じ前提コードの折り畳みを共有する。 */
import type { Slide } from '../../../core/content/types';
import { SlideBlocks } from './SlideBlocks';

/** 呼出側が同Lessonから解決した先行Slideのコードを、内容を複製せず表示する。 */
export function SlideCodeReference({
  slide,
  baseUrl,
}: {
  readonly slide: Slide | undefined;
  readonly baseUrl: string;
}) {
  if (slide === undefined) return null;
  return (
    <details className="tc-slide-code-reference">
      <summary>前提のコードを確認：{slide.title}</summary>
      <SlideBlocks
        blocks={slide.blocks.filter((block) => block.type === 'code' && block.role !== 'output')}
        assets={[]}
        baseUrl={baseUrl}
        density="compact"
      />
    </details>
  );
}
