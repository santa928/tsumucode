---
id: html-css-ch08-l04-s02
title: flex-basisはMain Axis方向の初期Sizeを決める
kind: concept
concept: flex-basis
assets: []
---

`flex-basis`は、余白の伸縮を計算する前にItemがMain Axis方向へ占める基準Sizeです。rowなら幅、columnなら高さの基準になります。

幅600pxのContainerへBasis 180pxのCardをGap 16pxで置くと、3枚は`180 × 3 + 16 × 2 = 572px`で収まり、4枚目は次のLineへ進みます。

:::practice
prompt: 600pxのContainerへ180pxのCardと16pxのgapを3枚分置いた合計を計算します。
expectedAction: 572pxで収まると答える
estimatedMinutes: 2
:::

次の実習では4枚目の実測yとOverflowを確認します。
