---
id: html-css-ch08-l02-s02
title: gapは隣り合うItem間へ一定の距離を作る
kind: concept
concept: flex-gap
assets: []
---

`gap`はFlex Item同士の間へ余白を置きます。最初のItemの前や最後のItemの後には増えないため、Containerの外周Paddingと役割を分けられます。

```css
.actions {
  display: flex;
  gap: 20px;
}
```

実測距離は、先のItemの右端から次のItemの左端までです。Computed `gap`だけでなく、Item位置でも意図した20pxを確認できます。

:::practice
prompt: 幅80pxのItemがx 32pxから始まりgap 20pxなら、2つ目のxを計算します。
expectedAction: 32 + 80 + 20で132pxと答える
estimatedMinutes: 2
:::

次の実習ではComputed Gapと2つ目の位置を確認します。
