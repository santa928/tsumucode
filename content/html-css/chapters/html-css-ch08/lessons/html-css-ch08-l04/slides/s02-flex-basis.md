---
id: html-css-ch08-l04-s02
title: flex-basisはMain Axis方向の初期Sizeを決める
kind: concept
concept: flex-basis
layout: code-preview
teachesConceptIds: [flex-basis]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: wrap-calculation-detail
    source: assets/wrap-calculation.svg
    mediaType: image
    alt: 180pxのCardと3枚分の幅計算を示す図
    provenanceId: ch08-wrap-calculation-original
---

`flex-basis`は、余白の伸縮を計算する前にItemがMain Axis方向へ占める基準Sizeです。rowなら幅、columnなら高さの基準になります。

![180pxのCardが3枚収まる幅計算](asset:wrap-calculation-detail)

幅600pxのContainerへBasis 180pxのCardをGap 16pxで置くと、3枚は`180 × 3 + 16 × 2 = 572px`で収まります。

```css
[data-card] {
  flex-basis: 180px;
}
```

4枚目までの合計は768pxなので、`flex-wrap: wrap;`があれば次のLineへ進みます。

:::practice
prompt: 600pxのContainerへ180pxのCardと16pxのgapを3枚分置いた合計を計算します。
expectedAction: 572pxで収まると答える
estimatedMinutes: 2
:::

次の実習では`nowrap`を`wrap`へ、`220px`を`180px`へ変えます。
