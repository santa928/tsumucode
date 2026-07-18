---
id: html-css-ch09-l02-s01
title: repeatとfrが等幅Trackを簡潔に表す
kind: code
concept: repeat-fr-tracks
assets: []
---

同じTrack定義を繰り返すときは`repeat()`を使えます。`fr`はGapなどを除いた利用可能な余白を比率で分ける単位です。

```css
.gallery {
  grid-template-columns: repeat(3, 1fr);
}
```

幅600px、Gap 16pxが2つなら、Trackへ分ける幅は568pxです。各1frは約189.33pxになります。

:::practice
prompt: 600pxから16pxのGapを2つ引き、3つの1frへ分ける計算をします。
expectedAction: 568 ÷ 3で約189.33pxと答える
estimatedMinutes: 2
:::

次はGapを含めたItemの実測位置を確認します。
