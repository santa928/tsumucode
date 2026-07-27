---
id: html-css-ch08-l02-s01
title: justify-contentはMain Axisの余白を分配する
kind: comparison
concept: justify-content-distribution
layout: code-preview
teachesConceptIds: [justify-content]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: distribution-gap
    source: assets/distribution-gap.svg
    mediaType: image
    alt: flex-startとcenterの余白分配、Item間のgapを比較する図
    provenanceId: ch08-distribution-gap-original
---

`justify-content`は、Containerに残ったMain Axis方向の余白をどう配るか決めます。`flex-start`はStartへ集め、`center`は中央、`space-between`はItem同士の間へ分配します。

![Main Axisの余白分配](asset:distribution-gap)

```css
[data-actions] {
  justify-content: flex-start;
}
```

Item幅の合計がContainer幅と同じなら、分配できる余白はありません。まずContainerとItemの実寸を確認します。

:::practice
prompt: 両端のItemをContainerの端へ置き、間へ余白を分配する値を選びます。
expectedAction: space-betweenを選ぶ
estimatedMinutes: 2
:::

次は、余白の分配とは別に、Item間の固定距離を作ります。
