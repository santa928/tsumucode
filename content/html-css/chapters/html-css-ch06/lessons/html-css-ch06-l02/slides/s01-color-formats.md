---
id: html-css-ch06-l02-s01
title: colorとbackground-colorを組み合わせる
kind: comparison
concept: css-color-formats
layout: code-preview
teachesConceptIds: [color-background-color]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: contrast-colors
    source: assets/contrast-and-cue.svg
    mediaType: image
    alt: 薄い文字と濃い文字を白い背景上で比較した図
    provenanceId: ch06-contrast-and-cue-original
---

`color`は文字などの前景色、`background-color`は背景色です。文字の読みやすさは、2つの組み合わせで決まります。

![前景色と背景色の組み合わせ](asset:contrast-colors)

実習の白い背景は完成済みです。薄い`color: #9a9a9a;`だけを、濃い`#24323d`へ変更します。

```css
[data-message] {
  color: #24323d;
  background: #fff;
}
```

:::practice
prompt: 白い背景上で、薄い灰色と濃い青灰色のどちらが読みやすいか比べます。
expectedAction: 明るさの差が大きい#24323dを選ぶ
estimatedMinutes: 2
:::

次は、色の差を比率で測り、色以外でも状態を伝えます。
