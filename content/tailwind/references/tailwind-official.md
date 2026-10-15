# 参照した公式資料

- [Utility class](https://tailwindcss.com/docs/styling-with-utility-classes)
- [gap](https://tailwindcss.com/docs/gap)
- [padding](https://tailwindcss.com/docs/padding)
- [ブラウザ用compilerの用途](https://tailwindcss.com/docs/installation/play-cdn)

この教材は原著です。Tailwind 4.3.2の既定themeと16pxのroot font-sizeを使うため、gap-4とp-4は1rem（16px）になります。任意のthemeでも同じpxになるとは説明しません。
ブラウザ用compilerは開発用です。本教材では隔離プレビューだけで使います。制作物の本番CSS生成は別タスクで扱います。

- [幅の上限](https://tailwindcss.com/docs/max-width)
- [文字の大きさ](https://tailwindcss.com/docs/font-size)
- [hover・focus・disabled](https://tailwindcss.com/docs/hover-focus-and-other-states)
- [mobile-firstとbreakpoint](https://tailwindcss.com/docs/responsive-design)

2026-10-15に公式v4.3資料と固定compilerを照合しました。教材の図・例文・問題は原著です。

この草稿の実習は有限のclassだけを扱います。幅はw-full・w-80・max-w-80、文字はtext-base/lg/xl・leading-6/7・font-bold、色は既存のslate指定と黒・白、outlineはnone/solid/2/black/offset-2、opacityは50/100に対応します。hoverは黒・白の背景/文字色、focusとfocus-visibleはoutline、disabledはopacity、smとmdはflex-row/colの単一variantだけです。variant連結・任意Selectorは未対応です。数値任意値はgap/pが0〜128pxまたは0〜8rem、w/max-wが0〜1024pxまたは0〜64remで、小数は2桁までです。Tailwind全体の制限を意味しません。

hoverのCSSはhover対応環境で有効です。自動判定はmedia条件を保った検証用状態のStyleを観測し、通常時の色と区別します。実ポインター・キーボード操作も演習で確認してください。
