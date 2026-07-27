---
id: html-css-ch06-l01-s01
title: Font SizeとLine Heightを別々に整える
kind: concept
concept: typography-size-line-height
layout: code-preview
teachesConceptIds: [font-size, line-height]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: typography-metrics
    source: assets/typography-metrics.svg
    mediaType: image
    alt: Font Size 20pxとLine Height 30pxの違いを文字と行の枠で示した図
    provenanceId: ch06-typography-metrics-original
---

`font-size`は文字そのものの大きさ、`line-height`は1行が占める高さです。2つを分けると、文字を読みやすくしながら行間も調整できます。

![Font SizeとLine Heightの違い](asset:typography-metrics)

Root 16pxでは`1.25rem`が20pxです。単位なしの`line-height: 1.5;`は20×1.5でComputed 30pxになります。

```css
.reading-sample {
  font-size: 1.25rem;
  line-height: 1.5;
}
```

:::practice
prompt: 20pxの文字へline-height 1.5を掛けた行の高さを計算します。
expectedAction: 20 × 1.5で30pxと答える
estimatedMinutes: 2
:::

次は、端末にあるFontをFallback付きで選びます。
