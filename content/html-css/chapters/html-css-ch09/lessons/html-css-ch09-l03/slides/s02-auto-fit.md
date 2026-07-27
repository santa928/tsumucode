---
id: html-css-ch09-l03-s02
title: auto-fitは収まる数だけTrackを作る
kind: comparison
concept: auto-fit-responsive-grid
layout: code-preview
teachesConceptIds: [auto-fit]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: auto-fit-responsive-grid
    source: assets/responsive-grid.svg
    mediaType: image
    alt: 同じGrid CSSが720pxでは4列、358pxでは2列になる比較図
    provenanceId: ch09-responsive-grid-original
---

`repeat()`の回数へ`auto-fit`を書くと、最小幅を守って収まる数だけTrackを作ります。列数を固定しないため、狭くなると自然に次のRowへ送られます。

![同じCSSによるDesktop4列とMobile2列](asset:auto-fit-responsive-grid)

```css
.gallery {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
```

利用可能幅358pxなら`160 × 2 + 16 = 336px`で2列が収まります。3列は496px必要なので、3枚目は2行目です。

:::practice
prompt: 利用可能幅358pxへ160pxのTrackと16pxのGapがいくつ収まるか計算します。
expectedAction: 160 × 2 + 16で336pxとなり2列と答える
estimatedMinutes: 2
:::

次の実習では`120px→160px`、`2→auto-fit`の2か所だけを変更します。
