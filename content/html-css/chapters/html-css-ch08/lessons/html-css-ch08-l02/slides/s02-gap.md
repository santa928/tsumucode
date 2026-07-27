---
id: html-css-ch08-l02-s02
title: gapは隣り合うItem間へ一定の距離を作る
kind: concept
concept: flex-gap
layout: code-preview
teachesConceptIds: [gap]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: distribution-gap-detail
    source: assets/distribution-gap.svg
    mediaType: image
    alt: 80pxのItem間に20pxのGapが入る図
    provenanceId: ch08-distribution-gap-original
---

`gap`はFlex Item同士の間へ余白を置きます。最初のItemの前や最後のItemの後には増えないため、Containerの外周Paddingと役割を分けられます。

![Item間だけに入る20pxのGap](asset:distribution-gap-detail)

```css
.actions {
  display: flex;
  gap: 20px;
}
```

実測距離は、先のItemの右端から次のItemの左端までです。実習では既存の`12px`を`20px`へ変え、2つ目のxが`32 + 80 + 20 = 132px`になるか確かめます。

:::practice
prompt: 幅80pxのItemがx 32pxから始まりgap 20pxなら、2つ目のxを計算します。
expectedAction: 32 + 80 + 20で132pxと答える
estimatedMinutes: 2
:::

次の実習では`justify-content`と`gap`のValueだけを変更します。
