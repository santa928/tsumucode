---
id: html-css-ch05-l01-s02
title: Computed Styleで4層の実値を確認する
kind: concept
concept: inspect-box-model
assets: []
---

Shorthandで値を書いても、Browserはpadding-topやborder-top-widthのような各辺のComputed Valueを持ちます。

`padding: 24px`、`border: 2px`、`margin: 32px`なら、Contentの外へ順に実寸が加わります。Widthだけを見ず4層を読みます。

:::practice
prompt: Padding 24pxとBorder 2pxが左右にあるとき、Content幅へ何px加わるか計算します。
expectedAction: 左右2組なので52pxと答える
estimatedMinutes: 2
:::

次の実習では4つのComputed Valueを指定値へそろえます。
