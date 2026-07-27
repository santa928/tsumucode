---
id: html-css-ch05-l04-s02
title: inline-blockで44pxの操作領域を作る
kind: comparison
concept: inline-block-controls
layout: code-preview
teachesConceptIds: [display-inline-block, minimum-target-size]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: target-inline-block
    source: assets/target-size.svg
    mediaType: image
    alt: 上下Padding 12pxとLine Height 20pxで高さ44pxになるLinkの図
    provenanceId: ch05-target-size-original
---

`display: inline-block;`なら、Linkを横へ並べたままPaddingを含むBoxとして扱えます。操作領域は小さすぎない実寸にします。

![44pxの操作領域](asset:target-inline-block)

実習ではLine Height 20pxが完成済みです。`display`を`inline-block`へ、Paddingを`12px 16px`へ変えると、20 + 12 + 12 = 44pxになります。

```css
nav a {
  display: inline-block;
  padding: 12px 16px;
}
```

:::practice
prompt: Line Height 20pxへ上下Padding 12pxを足した高さを計算します。
expectedAction: 20 + 12 + 12で44pxと答える
estimatedMinutes: 2
:::

次の実習では、DisplayとPaddingの2箇所だけを変更します。
