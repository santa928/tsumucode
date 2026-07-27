---
id: html-css-ch10-l02-s02
title: min-widthのMedia QueryでRowへ拡張する
kind: code
concept: min-width-media-query
layout: code-preview
teachesConceptIds: [media-query]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: media-query-breakpoint
    source: assets/diagram-responsive-breakpoints.svg
    mediaType: image
    alt: 768pxを境にColumnからRowへ切り替わるResponsive図
    provenanceId: ch10-responsive-breakpoints-slide-original
---

`@media (min-width: 768px)`の中は、Viewportが768px以上のときだけ有効です。Baseの`column`を残し、条件内で`row`へ上書きします。

![768pxでColumnからRowへ変わる図](asset:media-query-breakpoint)

```css
@media (min-width: 768px) {
  [data-layout] {
    flex-direction: row;
  }
}
```

実習ではStarterにある`900px`だけを`768px`へ変えます。括弧・Colon・単位`px`は残します。

:::practice
prompt: 768px以上でflex-directionをrowへ変える
expectedAction: min-width Media Queryを書く
estimatedMinutes: 2
:::

次の実習ではBreakpointの数値1か所だけを変更します。
