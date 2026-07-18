---
id: html-css-ch10-l03-s01
title: 百分率の幅は利用可能な空間へ追従する
kind: concept
concept: fluid-container-width
assets: []
---

`width: calc(100% - 32px)`ならViewportの左右へ16pxずつ安全余白を残して縮みます。固定幅だけを使わず、親の利用可能幅に応じて変化させます。

:::practice
prompt: 390pxから32pxを引いたContainer幅を計算する
expectedAction: 358pxと答える
estimatedMinutes: 2
:::

次の観察または実習で、Viewportごとの最終結果を確認します。
