---
id: html-css-ch06-l01-s02
title: Font Stackは左から使える候補を選ぶ
kind: comparison
concept: system-font-stack
layout: code-preview
teachesConceptIds: [font-family-system]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: font-stack-order
    source: assets/typography-metrics.svg
    mediaType: image
    alt: system-uiからsans-serifへ候補を順に確認するFont Stackの図
    provenanceId: ch06-typography-metrics-original
---

`font-family`へ候補を左から並べると、Browserは使える最初のFontを選びます。`system-ui`は端末のUI Font、`sans-serif`は最後のFallbackです。

![Font Stackの選択順](asset:font-stack-order)

実習ではFont Familyが完成済みです。`font-size`と`line-height`の2つだけを変更し、`system-ui, sans-serif`は壊さず残します。

```css
.reading-sample {
  font-family: system-ui, sans-serif;
}
```

:::practice
prompt: system-uiが使えない環境で次に使う一般Familyを答えます。
expectedAction: sans-serifをFallbackとして残す
estimatedMinutes: 2
:::

次の実習では、2つのValueを変更し、Font Stackも保たれたことを確認します。
