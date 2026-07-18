---
id: html-css-ch05-l02-s01
title: widthとheightはSizingの基準を作る
kind: concept
concept: width-height
assets: []
---

`width`と`height`はBoxの大きさを指定しますが、既定のcontent-boxではPaddingとBorderが指定幅の外へ加わります。

Containerへ収めたいときは、指定幅がどの層を表すかを先に確認します。数値だけ合わせてもBox全体が越える場合があります。

:::practice
prompt: width 300pxへ左右Padding 20pxを加えたcontent-boxの外幅を計算します。
expectedAction: Borderなしなら340pxと答える
estimatedMinutes: 2
:::

次はborder-boxで指定幅へ内側の層を含めます。
