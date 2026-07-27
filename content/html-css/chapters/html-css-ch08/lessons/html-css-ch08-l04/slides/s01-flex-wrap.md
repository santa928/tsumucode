---
id: html-css-ch08-l04-s01
title: flex-wrapは収まらないItemを次のLineへ送る
kind: concept
concept: flex-wrap-lines
layout: code-preview
teachesConceptIds: [flex-wrap]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: wrap-calculation
    source: assets/wrap-calculation.svg
    mediaType: image
    alt: 600pxのContainerに180pxのCardが3枚収まり4枚目が折り返す図
    provenanceId: ch08-wrap-calculation-original
---

既定の`flex-wrap: nowrap`では、Itemは1行へ留まろうとして縮むか、Containerを越えます。`wrap`を指定すると、収まらないItemが次のFlex Lineへ移ります。

![3枚分の幅と4枚目の折り返し](asset:wrap-calculation)

```css
[data-card-grid] {
  flex-wrap: wrap;
}
```

折り返しはViewport幅だけでなく、Container幅、ItemのBasis、Gapの合計で決まります。

:::practice
prompt: 横Overflowを避けながらCardを複数行へ並べるwrap値を答えます。
expectedAction: flex-wrap wrapと答える
estimatedMinutes: 2
:::

次は、折り返し計算の基準になるItem幅を決めます。
