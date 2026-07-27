/** Slideを1画面へ収めるための構造量とLayout固有契約を検証する。 */
import type { Slide } from '../../src/core/content/types';

export interface SlideContentMeasure {
  readonly textCharacters: number;
  readonly codeLines: number;
  readonly visuals: number;
  readonly practiceBlocks: number;
}

/** Unicode code point単位で教材文の文字数を返す。 */
function characterCount(text: string): number {
  return Array.from(text).length;
}

/** 空Codeを0行、それ以外を改行区切りの行数として返す。 */
function codeLineCount(code: string): number {
  return code.length === 0 ? 0 : code.split('\n').length;
}

/** Slide Blockを走査し、画面予算へ使う構造量を返す。 */
export function measureSlideContent(slide: Slide): SlideContentMeasure {
  let textCharacters = 0;
  let codeLines = 0;
  let visuals = 0;
  let practiceBlocks = 0;
  for (const block of slide.blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        textCharacters += characterCount(block.text);
        break;
      case 'list':
        textCharacters += block.items.reduce((total, item) => total + characterCount(item), 0);
        break;
      case 'callout':
        textCharacters += characterCount(block.text);
        if (block.title !== undefined) textCharacters += characterCount(block.title);
        break;
      case 'practice':
        textCharacters += characterCount(block.prompt) + characterCount(block.expectedAction);
        practiceBlocks += 1;
        break;
      case 'code':
        codeLines += codeLineCount(block.code);
        break;
      case 'image':
        visuals += 1;
        break;
    }
  }
  return { textCharacters, codeLines, visuals, practiceBlocks };
}

/** Slideの宣言予算とLayout固有のBlock構成を検証する。 */
export function assertSlideScreenBudget(slide: Slide): void {
  const measure = measureSlideContent(slide);
  if (measure.textCharacters > slide.screenBudget.maxTextCharacters) {
    throw new Error(
      `Slide ${slide.id}: maxTextCharacters=${String(slide.screenBudget.maxTextCharacters)} actual=${String(measure.textCharacters)}`,
    );
  }
  if (measure.codeLines > slide.screenBudget.maxCodeLines) {
    throw new Error(
      `Slide ${slide.id}: maxCodeLines=${String(slide.screenBudget.maxCodeLines)} actual=${String(measure.codeLines)}`,
    );
  }
  if (measure.visuals > slide.screenBudget.maxVisuals) {
    throw new Error(
      `Slide ${slide.id}: maxVisuals=${String(slide.screenBudget.maxVisuals)} actual=${String(measure.visuals)}`,
    );
  }
  if (measure.practiceBlocks > 1) {
    throw new Error(`Slide ${slide.id}: Practiceは最大1件です`);
  }

  const codeBlocks = slide.blocks.filter(({ type }) => type === 'code').length;
  if (slide.layout === 'explanation' && codeBlocks > 0) {
    throw new Error(`Slide ${slide.id}: explanationはCode 0件にしてください`);
  }
  if (slide.layout === 'code-preview') {
    if (codeBlocks === 0) {
      throw new Error(`Slide ${slide.id}: code-previewはCode 1件以上が必要です`);
    }
    if (measure.visuals === 0) {
      throw new Error(`Slide ${slide.id}: code-previewはVisual 1件以上が必要です`);
    }
  }
  if (slide.layout === 'checkpoint' && measure.practiceBlocks !== 1) {
    throw new Error(`Slide ${slide.id}: checkpointはPractice 1件が必要です`);
  }
}
