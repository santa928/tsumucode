---
id: html-css-ch09-l01-s02
title: 明示TrackがColumnの境界を作る
kind: diagram
concept: explicit-grid-tracks
assets:
  - id: diagram-grid-tracks
    source: assets/diagram-grid-tracks.svg
    mediaType: image
    alt: 3つのColumn Track、2つのRow Track、Gap、Grid Line番号を示す図
    provenanceId: ch09-grid-tracks-slide-original
---

`grid-template-columns`へ幅を並べると、明示的なColumn Trackが作られます。2つの値なら2列、3つなら3列です。

![Grid TrackとLine](asset:diagram-grid-tracks)

Trackの間にはGrid Lineがあり、Item PlacementではLine番号を使えます。GapはTrackの中ではなくTrack同士の間にあります。

:::practice
prompt: grid-template-columnsへ160px 240pxと書いたときのColumn数を答えます。
expectedAction: 幅160pxと240pxの2 Columnと答える
estimatedMinutes: 2
:::

次の実習では2枚目のItem位置から最初のTrack幅を確認します。
