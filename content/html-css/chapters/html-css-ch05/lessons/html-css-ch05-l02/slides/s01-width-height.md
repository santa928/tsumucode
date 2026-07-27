---
id: html-css-ch05-l02-s01
title: widthはContent幅を指定する
kind: concept
concept: width-height
layout: code-preview
teachesConceptIds: [width-height]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: sizing-width
    source: assets/sizing-comparison.svg
    mediaType: image
    alt: width 320pxにPaddingとBorderが加わるcontent-boxの図
    provenanceId: ch05-sizing-comparison-original
---

`width`はBoxの横幅、`height`は縦幅を指定します。ただし既定の`content-box`では、`width`が表すのはContentだけです。

![content-boxの指定幅と外幅](asset:sizing-width)

Width 320pxへ左右24pxのPaddingと2pxのBorderを足すと、外幅は372pxになります。320pxのFrameには収まりません。

```css
.sized-card {
  width: 320px;
  padding: 24px;
  border: 2px solid;
}
```

:::practice
prompt: width 320pxへ左右Padding 24px、Border 2pxを加えた外幅を計算します。
expectedAction: 320 + 48 + 4で372pxと答える
estimatedMinutes: 2
:::

次は、指定幅へPaddingとBorderを含める書き方を見ます。
