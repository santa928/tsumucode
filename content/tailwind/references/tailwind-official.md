# 参照した公式資料

- [Utility class](https://tailwindcss.com/docs/styling-with-utility-classes)
- [gap](https://tailwindcss.com/docs/gap)
- [padding](https://tailwindcss.com/docs/padding)
- [ブラウザ用compilerの用途](https://tailwindcss.com/docs/installation/play-cdn)

この教材は原著です。導入4教材ではTailwind 4.3.2の既定themeと16pxのroot font-sizeを使うため、gap-4とp-4は1rem（16px）になります。任意のthemeでも同じpxになるとは説明しません。制作課題では名前を付けた3tokenを追加します。
ブラウザー用compilerは開発用です。本教材では隔離プレビューだけで使います。制作課題の持ち出し先では、固定Vite Pluginで本番用CSSを事前生成します。

- [幅の上限](https://tailwindcss.com/docs/max-width)
- [文字の大きさ](https://tailwindcss.com/docs/font-size)
- [hover・focus・disabled](https://tailwindcss.com/docs/hover-focus-and-other-states)
- [mobile-firstとbreakpoint](https://tailwindcss.com/docs/responsive-design)

2026-10-15に公式v4.3資料と固定compilerを照合しました。教材の図・例文・問題は原著です。

導入4教材の実習は有限のclassだけを扱います。幅はw-full・w-80・max-w-80、文字はtext-base/lg/xl・leading-6/7・font-bold、色は既存のslate指定と黒・白、outlineはnone/solid/2/black/offset-2、opacityは50/100に対応します。hoverは黒・白の背景/文字色、focusとfocus-visibleはoutline、disabledはopacity、smとmdはflex-row/colの単一variantだけです。variant連結・任意Selectorは未対応です。数値任意値はgap/pが0〜128pxまたは0〜8rem、w/max-wが0〜1024pxまたは0〜64remで、小数は2桁までです。Tailwind全体の制限を意味しません。

hoverのCSSはhover対応環境で有効です。自動判定はmedia条件を保った検証用状態のStyleを観測し、通常時の色と区別します。実ポインター・キーボード操作も演習で確認してください。

- [theme変数とUtility](https://tailwindcss.com/docs/theme)
- [@theme・@apply](https://tailwindcss.com/docs/functions-and-directives)
- [共通classとcomponents層](https://tailwindcss.com/docs/adding-custom-styles)
- [Vite Plugin](https://tailwindcss.com/docs/installation/using-vite)

制作課題だけはindex.htmlとstyles.cssの2ファイルを扱います。固定のtailwindcss取込、color-brand・color-paper・spacing-card、.note-cardの有限@applyに対応します。CSSの部品が共通の見た目を持ち、カードの内容と親の配置はHTMLが担います。サイト外では同じ2ソースを固定Vite 8.2.0・Tailwind/Plugin 4.3.2とlockfileでbuildします。新規公開は別工程です。
