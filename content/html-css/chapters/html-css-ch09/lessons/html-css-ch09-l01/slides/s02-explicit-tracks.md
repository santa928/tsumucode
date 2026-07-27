---
id: html-css-ch09-l01-s02
title: grid-template-columnsは列幅を左から並べる
kind: diagram
concept: explicit-grid-tracks
layout: code-preview
teachesConceptIds: [grid-template-columns]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: diagram-grid-tracks
    source: assets/diagram-grid-tracks.svg
    mediaType: image
    alt: 3つのColumn Track、2つのRow Track、Gap、Grid Line番号を示す図
    provenanceId: ch09-grid-tracks-slide-original
---

`grid-template-columns`へ幅を2つ書くと、2本のColumn Trackができます。Valueは左の列から順に対応します。

![Grid TrackとLine](asset:diagram-grid-tracks)

```css
[data-grid] {
  grid-template-columns: 160px 240px;
}
```

1枚目は160px、2枚目は240pxです。既にある`gap: 16px;`は列幅の外側、2本のTrackの間にだけ入ります。

:::practice
prompt: grid-template-columnsの2つのValueが、どちらのCard幅になるか答えます。
expectedAction: 左が160px、右が240pxになると答える
estimatedMinutes: 2
:::

次の実習では`display`と`grid-template-columns`のValueだけを変更します。
