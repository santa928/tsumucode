---
id: html-css-ch05-l05-s01
title: overflow-xは横の境界越えを表す
kind: concept
concept: overflow-boundary
layout: code-preview
teachesConceptIds: [overflow-x]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: safe-sizing-overflow
    source: assets/safe-sizing.svg
    mediaType: image
    alt: 320pxのFrameから360pxのCardが横へはみ出す図
    provenanceId: ch05-safe-sizing-original
---

Childの外幅が親の幅を越えると、`overflow-x`が発生します。内容を隠す前に、ChildのSizingを直します。

![横Overflowが起きるCard](asset:safe-sizing-overflow)

実習のFrameは幅320px・高さ220px、Cardは幅360px・高さ240pxです。さらに既定のcontent-boxではPaddingとBorderも外へ加わるため、rightとbottomの両方を越えます。

```css
.frame {
  width: 320px;
  height: 220px;
}
.safe-card {
  width: 360px;
  height: 240px;
  padding: 24px;
}
```

:::practice
prompt: 320×220pxのFrameと360×240pxのChildで越える辺を答えます。
expectedAction: rightとbottomを越え、横方向にはoverflow-xが起きると答える
estimatedMinutes: 2
:::

次は、親幅へ安全に収める2つの宣言を見ます。
