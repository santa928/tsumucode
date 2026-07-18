---
id: html-css-ch06-l01-s01
title: 文字の大きさと行間を別々に調整する
kind: concept
concept: typography-size-line-height
assets: []
---

`font-size`は文字そのものの大きさ、`line-height`は1行が占める高さを決めます。本文では文字を大きくするだけでなく、行同士が詰まりすぎない余白も必要です。

```css
.note {
  font-size: 1.25rem;
  line-height: 1.5;
}
```

単位なしの`line-height`はFont Sizeへ倍率として掛かります。20pxの文字へ1.5を指定すると、Computed Line Heightは30pxです。

:::practice
prompt: 20pxの文字へline-height 1.5を指定したときの行の高さを計算します。
expectedAction: 20 × 1.5で30pxと答える
estimatedMinutes: 2
:::

次は端末にあるFontを安全な順で選びます。
