/** 検証済み教材Blockを、実行可能HTMLへ変換せず安全なReact要素として表示する。 */
import type { AssetRef, SlideBlock } from '../../../core/content/types';
import { resolvePublicAsset } from '../../../shared/lib/resolvePublicAsset';

interface SlideBlocksProps {
  readonly blocks: readonly SlideBlock[];
  readonly assets: readonly AssetRef[];
  readonly baseUrl: string;
  readonly density?: 'default' | 'compact';
}

const CALLOUT_STYLE = {
  note: 'border-workshop-complete',
  tip: 'border-workshop-learning',
  warning: 'border-workshop-correction',
} as const;

const CALLOUT_LABEL = {
  note: 'メモ',
  tip: '組み立てのコツ',
  warning: '注意',
} as const;

/** Schema追加時に未対応Blockを型検査で検出する。 */
function assertNever(value: never): never {
  throw new Error(`未対応のSlide Blockです: ${JSON.stringify(value)}`);
}

/** Compilerが許可した7種類のBlockだけを、意味に合うReact elementへ写像する。 */
export function SlideBlocks({ blocks, assets, baseUrl, density = 'default' }: SlideBlocksProps) {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const compact = density === 'compact';

  return (
    <div
      className={`tc-slide-blocks min-w-0 ${density === 'compact' ? 'grid gap-3' : 'space-y-6'}`}
      data-density={density}
    >
      {blocks.map((block, index) => {
        const key = `${block.type}-${String(index)}`;

        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h2
                key={key}
                className={
                  compact ? 'text-xl font-black md:text-2xl' : 'text-2xl font-black md:text-3xl'
                }
              >
                {block.text}
              </h2>
            ) : (
              <h3
                key={key}
                className={
                  compact ? 'text-lg font-black md:text-xl' : 'text-xl font-black md:text-2xl'
                }
              >
                {block.text}
              </h3>
            );
          case 'paragraph':
            return (
              <p key={key} className={compact ? 'text-base leading-7' : 'text-lg leading-8'}>
                {block.text}
              </p>
            );
          case 'list': {
            const listClassName =
              block.style === 'ordered'
                ? 'list-decimal marker:font-black marker:text-workshop-complete'
                : 'list-disc marker:text-workshop-complete';
            const items = block.items.map((item, itemIndex) => (
              <li
                key={`${item}-${String(itemIndex)}`}
                className={compact ? 'pl-1 leading-6' : 'pl-1 leading-7'}
              >
                {item}
              </li>
            ));

            return block.style === 'ordered' ? (
              <ol key={key} aria-label="手順" className={`space-y-2 pl-6 ${listClassName}`}>
                {items}
              </ol>
            ) : (
              <ul key={key} aria-label="ポイント" className={`space-y-2 pl-6 ${listClassName}`}>
                {items}
              </ul>
            );
          }
          case 'code':
            return (
              <div key={key} className="overflow-hidden rounded-workshop-md bg-workshop-ink">
                <p
                  className={`border-b border-workshop-muted font-mono text-sm font-bold text-workshop-learning ${compact ? 'px-3 py-1.5' : 'px-4 py-2'}`}
                >
                  {block.language}
                </p>
                <pre
                  tabIndex={0}
                  data-slide-horizontal-scroll
                  aria-label={`${block.language}のコード例（横スクロール可能）`}
                  className={`overflow-x-auto text-workshop-on-primary ${compact ? 'p-3' : 'p-4'}`}
                >
                  <code className="font-mono">{block.code}</code>
                </pre>
              </div>
            );
          case 'image': {
            const asset = assetById.get(block.assetId);
            if (asset === undefined) {
              throw new Error(`Slide Assetが見つかりません: ${block.assetId}`);
            }
            if (asset.mediaType !== 'image') {
              throw new Error(`Slide Assetが画像ではありません: ${block.assetId}`);
            }

            return (
              <img
                key={key}
                src={resolvePublicAsset(baseUrl, asset.path)}
                alt={block.alt}
                width={asset.intrinsicWidth}
                height={asset.intrinsicHeight}
                decoding="async"
                fetchPriority="low"
                style={
                  asset.intrinsicWidth !== undefined && asset.intrinsicHeight !== undefined
                    ? {
                        aspectRatio: `${String(asset.intrinsicWidth)} / ${String(asset.intrinsicHeight)}`,
                      }
                    : undefined
                }
                className="h-auto max-w-full rounded-workshop-md border border-workshop-border bg-workshop-raised"
              />
            );
          }
          case 'practice': {
            const titleId = `slide-practice-title-${String(index)}`;
            return (
              <section
                key={key}
                aria-labelledby={titleId}
                className={`rounded-workshop-md border-2 border-workshop-learning bg-workshop-raised shadow-[var(--tc-shadow-piece)] ${compact ? 'p-4' : 'p-5'}`}
              >
                <h2 id={titleId} className="text-lg font-black">
                  今すぐ試す（約{block.estimatedMinutes}分）
                </h2>
                <p className={compact ? 'mt-2 leading-6' : 'mt-3 leading-7'}>{block.prompt}</p>
                <p
                  className={`${compact ? 'mt-2' : 'mt-3'} border-l-4 border-workshop-learning pl-3 text-workshop-muted`}
                >
                  <span className="font-bold text-workshop-ink">確認すること：</span>
                  {block.expectedAction}
                </p>
              </section>
            );
          }
          case 'callout':
            return (
              <div
                key={key}
                role="note"
                aria-label={
                  block.title
                    ? `${CALLOUT_LABEL[block.tone]}：${block.title}`
                    : CALLOUT_LABEL[block.tone]
                }
                data-callout-tone={block.tone}
                className={`rounded-workshop-md border-l-4 bg-workshop-raised ${compact ? 'p-4' : 'p-5'} ${CALLOUT_STYLE[block.tone]}`}
              >
                <p className="text-sm font-black text-workshop-complete">
                  {CALLOUT_LABEL[block.tone]}
                </p>
                {block.title ? <p className="mt-1 font-black">{block.title}</p> : null}
                <p className="mt-2 leading-7 text-workshop-muted">{block.text}</p>
              </div>
            );
          default:
            return assertNever(block);
        }
      })}
    </div>
  );
}
