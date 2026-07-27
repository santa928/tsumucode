---
id: html-css-ch09-l03-s01
title: minmaxはCardが縮む下限を決める
kind: concept
concept: minmax-grid-track
layout: code-preview
teachesConceptIds: [minmax-function]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: responsive-track-minimum
    source: assets/responsive-grid.svg
    mediaType: image
    alt: 160pxの最小幅を保ったままDesktop4列とMobile2列になるGridの図
    provenanceId: ch09-responsive-grid-original
---

`minmax(最小, 最大)`は、Trackが伸び縮みできる範囲を決めます。`minmax(160px, 1fr)`なら160px未満にせず、余白があれば広げます。

![160pxの下限を持つResponsive Grid](asset:responsive-track-minimum)

```css
.gallery {
  grid-template-columns: repeat(2, minmax(160px, 1fr));
}
```

最小値は「Cardの文字やButtonが読める幅」から決めます。実習ではStarterの120pxを160pxへ変更します。

:::practice
prompt: Cardを160px未満にせず残り幅へ広げるTrack定義を答えます。
expectedAction: minmax(160px, 1fr)と答える
estimatedMinutes: 2
:::

次は固定の列数`2`を、自動で収まる列数へ変えます。
