---
id: html-css-ch09-l02-s02
title: GridのgapはRowとColumnの間を分ける
kind: concept
concept: grid-gap
assets: []
---

Gridでも`gap`は隣り合うTrackの間へ一定の距離を作ります。`row-gap`と`column-gap`を別々にすることもできます。

3列の2枚目は、Containerのxに1 Track分と1 Gap分を足した位置から始まります。Computed TemplateだけでなくItem Boundaryを見ると、丸めを含む最終結果を確認できます。

:::practice
prompt: x 32px、Track約189.33px、Gap 16pxなら2枚目のxを計算します。
expectedAction: 約237.33pxと答える
estimatedMinutes: 2
:::

次の実習では3つの1frと実測位置を結び付けます。
