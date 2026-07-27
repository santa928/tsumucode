---
id: html-css-ch09-l02-s02
title: 1frはGapを除いた残り幅を分ける
kind: concept
concept: grid-gap
layout: code-preview
teachesConceptIds: [fr-unit, grid-gap]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: fr-gap-calculation
    source: assets/repeat-fr-calculation.svg
    mediaType: image
    alt: 600pxから2つの16px Gapを引き、残り568pxを3等分する図
    provenanceId: ch09-repeat-fr-calculation-original
---

`fr`は、Containerの利用可能な残り幅を比率で分ける単位です。3つの`1fr`なら3等分します。Gridの`gap`は先に幅から引かれます。

![600pxを3つの1frへ分配する計算](asset:fr-gap-calculation)

```css
[data-grid] {
  grid-template-columns: repeat(3, 1fr);
}
```

600pxから16pxのGapを2つ引くと568pxです。`568 ÷ 3`で1列は約189.33px、2枚目のxは`32 + 189.33 + 16 = 237.33px`になります。

:::practice
prompt: 600pxからGapを引き、1つの1fr幅を計算します。
expectedAction: (600 - 16 × 2) ÷ 3で約189.33pxと答える
estimatedMinutes: 2
:::

次の実習では固定幅の3列を、この1行へ置き換えます。
