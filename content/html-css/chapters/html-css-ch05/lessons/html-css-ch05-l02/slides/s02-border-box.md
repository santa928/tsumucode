---
id: html-css-ch05-l02-s02
title: border-boxは指定幅へ内側の層を含める
kind: comparison
concept: border-box-sizing
layout: code-preview
teachesConceptIds: [box-sizing-border-box]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: sizing-border-box
    source: assets/sizing-comparison.svg
    mediaType: image
    alt: content-boxの372pxとborder-boxの320pxを比較した図
    provenanceId: ch05-sizing-comparison-original
---

`box-sizing: border-box;`を使うと、WidthはContent、Padding、Borderを合わせた外枠を表します。

![content-boxとborder-boxの比較](asset:sizing-border-box)

実習のStarterは`width: 280px;`です。`.sized-card`の先頭へ`box-sizing: border-box;`を加え、Widthを`320px`へ変えると、Padding 24pxとBorder 2pxを含む外幅が320pxになります。

```css
.sized-card {
  box-sizing: border-box;
  width: 320px;
}
```

:::practice
prompt: PaddingとBorderを含めて外幅320pxにするSizing方式を選びます。
expectedAction: border-boxを選び、指定幅が外枠になると説明する
estimatedMinutes: 2
:::

次の実習では、2つの宣言を直してCardをFrameへ収めます。
