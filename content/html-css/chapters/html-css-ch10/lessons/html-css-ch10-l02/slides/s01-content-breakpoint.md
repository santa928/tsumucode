---
id: html-css-ch10-l02-s01
title: Breakpointは内容が窮屈になる幅で決める
kind: diagram
concept: content-driven-breakpoint
layout: code-preview
teachesConceptIds: [content-breakpoint]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: diagram-responsive-breakpoints
    source: assets/diagram-responsive-breakpoints.svg
    mediaType: image
    alt: 390px、768px、1280pxでCard列数が変わるResponsive図
    provenanceId: ch10-responsive-breakpoints-slide-original
---

Breakpointは「Tabletだから」ではなく、内容が横並びへ変わっても読める幅で決めます。今回はCard 240pxが2枚、Gap 16px、左右余白32pxで合計528px以上が必要です。

![Responsive Breakpointの変化](asset:diagram-responsive-breakpoints)

```css
/* 768px未満はColumnのまま */
@media (min-width: 768px) {
  /* Rowへ拡張 */
}
```

390pxは1列、768pxと1280pxは2枚を横へ置けます。3つの幅で2枚目の位置を比較します。

:::practice
prompt: 図で1列から2列へ変わる理由を内容幅から説明する
expectedAction: 内容が窮屈になる直前を選ぶ
estimatedMinutes: 2
:::

次は、この768px条件をCSSへ書きます。
