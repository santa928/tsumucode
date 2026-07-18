---
id: html-css-ch09-l04-s01
title: Grid LineでItemを複数Trackへまたがせる
kind: concept
concept: grid-item-placement
assets: []
---

`grid-column`はItemが始まるLineと終わるLineを指定します。`1 / -1`なら最初から最後まで、`span 2`なら現在位置から2 Track分へまたがります。

Placementは内容の重要度や構造を表すために使い、すべてのItemを座標で固定しません。自動配置を土台に、Feature Cardだけを広げます。

:::practice
prompt: 2 ColumnのGalleryでFeature Cardを全幅へ広げる指定を答えます。
expectedAction: grid-column 1 / -1またはspan 2を使う
estimatedMinutes: 2
:::

次はGridとFlexboxの役割を選び分けます。
