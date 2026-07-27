---
id: html-css-ch04-l04-s01
title: pxとremは長さの基準が違う
kind: comparison
concept: css-length-units
layout: code-preview
teachesConceptIds: [css-px, css-rem]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: unit-computation
    source: assets/unit-computation.svg
    mediaType: image
    alt: Root 16pxに2remを掛けてComputed 32pxになる計算図
    provenanceId: ch04-unit-computation-original
---

`px`はCSS Pixelを基準にした長さ、`rem`はRoot ElementのFont Sizeを基準にした相対的な長さです。

![16pxに2remを掛ける計算](asset:unit-computation)

実習のRootは`16px`です。`padding: 2rem;`は16×2で32pxになります。既にある`font-size: 1.25rem;`は20px、`border: 1px`は固定したい細さとしてそのまま残します。

```css
padding: 2rem;
font-size: 1.25rem;
border: 1px solid #2d5d62;
```

:::practice
prompt: Root 16pxで2remと1.25remをpxへ計算します。
expectedAction: 32pxと20pxを順に答える
estimatedMinutes: 2
:::

次は、書いた値とComputed Valueを見比べます。
