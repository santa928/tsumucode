---
id: html-css-ch09-l01-s01
title: display gridが2次元の配置領域を作る
kind: concept
concept: grid-container-items
assets: []
---

`display: grid`を親へ指定すると、直接の子がGrid Itemになります。Flexboxが主に1本のAxisへ並べるのに対し、GridはRowとColumnを同時に設計できます。

```css
.gallery {
  display: grid;
}
```

まずContainerを決め、その中へどんなTrackを作るかを宣言します。Itemごとに座標を固定するところから始めません。

:::practice
prompt: GalleryのCardをGrid Itemにしたいとき、display gridをどこへ指定するか答えます。
expectedAction: Cardを直接包む親Elementへ指定すると答える
estimatedMinutes: 2
:::

次は明示的なColumn Trackを作ります。
