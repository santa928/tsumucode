---
id: html-css-ch08-l02-s01
title: justify-contentはMain Axisの余白を分配する
kind: comparison
concept: justify-content-distribution
assets: []
---

`justify-content`は、Containerに残ったMain Axis方向の余白をどう配るか決めます。`flex-start`はStartへ集め、`center`は中央、`space-between`はItem同士の間へ分配します。

Item幅の合計がContainer幅と同じなら、分配する余白はありません。まずContainerとItemの実寸を確認します。

:::practice
prompt: 両端のItemをContainerの端へ置き、間へ余白を分配する値を選びます。
expectedAction: space-betweenを選ぶ
estimatedMinutes: 2
:::

一定の距離を作りたいときはgapを使います。
