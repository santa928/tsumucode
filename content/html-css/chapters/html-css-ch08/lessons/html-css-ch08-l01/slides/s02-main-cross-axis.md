---
id: html-css-ch08-l01-s02
title: DirectionがMain Axisの向きを決める
kind: diagram
concept: flex-main-cross-axis
assets:
  - id: diagram-flex-axis
    source: assets/diagram-flex-axis.svg
    mediaType: image
    alt: row方向でMain AxisとCross Axisを示すFlexbox図
    provenanceId: ch08-flex-axis-slide-original
---

`flex-direction: row`ではMain Axisが横、Cross Axisが縦です。`column`へ変えるとMain Axisが縦になり、2本の役割が入れ替わります。

![Flexboxの2本のAxis](asset:diagram-flex-axis)

`justify-*`はMain Axis、`align-*`はCross Axisへ働きます。画面の横・縦で覚えず、現在のDirectionからAxisを読みます。

:::practice
prompt: flex-direction columnのとき、Main Axisが進む方向を答えます。
expectedAction: 上から下へ進む縦方向と答える
estimatedMinutes: 2
:::

次の実習ではrowとcolumnのComputed Directionを確認します。
