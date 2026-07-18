---
id: html-css-ch05-l02-s02
title: border-boxは指定幅へPaddingとBorderを含める
kind: comparison
concept: border-box-sizing
assets: []
---

`box-sizing: border-box`では、widthがContent、Padding、Borderを合わせた外枠になります。固定Container内へ収める計算が明確です。

Width 320px、Padding 24px、Border 2pxでも、BoxのBorder外端は320pxに保たれます。Content領域が内側で調整されます。

:::practice
prompt: 同じ320px指定をcontent-boxとborder-boxで比べます。
expectedAction: PaddingとBorderを外へ足さないborder-boxを選ぶ
estimatedMinutes: 2
:::

次の実習ではCardを320px以内へ収めます。
