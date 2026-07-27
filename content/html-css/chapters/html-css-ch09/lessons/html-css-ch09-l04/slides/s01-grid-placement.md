---
id: html-css-ch09-l04-s01
title: grid-columnでFeature Cardを全列へ広げる
kind: concept
concept: grid-item-placement
layout: code-preview
teachesConceptIds: [grid-line-placement]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: grid-feature-placement
    source: assets/grid-flex-composition.svg
    mediaType: image
    alt: 2列GridでFeature CardがLine 1から最後のLineまで広がる図
    provenanceId: ch09-grid-flex-composition-original
---

`grid-column`は、Itemが始まるGrid Lineと終わるLineを指定します。`1 / -1`は最初のLineから最後のLineまでです。

![Feature Cardを2列へまたがせる配置](asset:grid-feature-placement)

```css
[data-feature] {
  grid-column: 1 / -1;
}
```

すべてのCardを座標指定せず、自動配置を土台にFeature Cardだけを広げます。`-1`なら列数が変わっても最後のLineを指せます。

:::practice
prompt: 2 ColumnのGalleryでFeature Cardを全幅へ広げる指定を答えます。
expectedAction: grid-column 1 / -1を使う
estimatedMinutes: 2
:::

次はCardの内側だけをFlexboxにします。
