---
id: html-css-ch09-l01-s01
title: 並べたいItemを包む親をGridにする
kind: concept
concept: grid-container-items
layout: code-preview
teachesConceptIds: [grid-container]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: grid-container-tracks
    source: assets/diagram-grid-tracks.svg
    mediaType: image
    alt: 1つのGrid Container内に3列2行のTrackと6つのItemが並ぶ図
    provenanceId: ch09-grid-tracks-slide-original
---

`display: grid;`を親へ書くと、直接の子がGrid Itemになります。並べたいCard一つずつではなく、Cardをまとめて包む親を選びます。

![Grid Containerと直接の子Item](asset:grid-container-tracks)

```css
[data-grid] {
  display: grid;
}
```

Gridは横のColumnと縦のRowを同時に扱えます。ただし最初の一歩はFlexboxと同じく「親をContainerにする」です。

:::practice
prompt: 2枚のCardをGrid Itemにするとき、display gridを書くElementを指します。
expectedAction: 2枚のCardを直接包むdata-grid属性の親を指す
estimatedMinutes: 2
:::

次は親の中へ2本のColumn Trackを作ります。
