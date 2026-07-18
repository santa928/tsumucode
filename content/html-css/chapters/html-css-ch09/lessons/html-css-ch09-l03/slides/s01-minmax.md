---
id: html-css-ch09-l03-s01
title: minmaxがTrackの最小と最大を決める
kind: concept
concept: minmax-grid-track
assets: []
---

`minmax(160px, 1fr)`は、Trackを160pxより小さくせず、余白があれば1frまで広げます。小さくなりすぎるCardを防ぎながら空間を使えます。

最小値を大きくしすぎると小さいViewportで1列しか収まりません。内容が読める最小幅を基準にします。

:::practice
prompt: Cardを160px未満にせず残り幅へ広げるTrack定義を答えます。
expectedAction: minmax(160px, 1fr)と答える
estimatedMinutes: 2
:::

次は利用可能幅に応じてTrack数を変えます。
