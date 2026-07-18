---
id: html-css-ch08-l01-s01
title: display flexが親をFlex Containerにする
kind: concept
concept: flex-container-items
assets: []
---

`display: flex`を親Elementへ指定すると、その直接の子がFlex Itemになります。子自身ではなく、並べる範囲を持つ親からLayoutを始めます。

```css
.skills {
  display: flex;
}
```

Flexboxは1本のAxisを中心にItemを配置する仕組みです。横並びか縦並びか、分配、揃え方、折り返しをContainer側で調整します。

:::practice
prompt: 3つのItemを並べたいとき、display flexを親と子のどちらへ指定するか答えます。
expectedAction: 直接の子を包む親Elementへ指定すると答える
estimatedMinutes: 2
:::

次はDirectionから2本のAxisを読みます。
