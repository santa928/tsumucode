---
id: html-css-ch05-l03-s01
title: paddingはBoxの内側を広げる
kind: concept
concept: padding-spacing
layout: code-preview
teachesConceptIds: [padding-property]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: spacing-padding
    source: assets/spacing-ownership.svg
    mediaType: image
    alt: Card内側のPadding 24pxを強調した図
    provenanceId: ch05-spacing-ownership-original
---

`padding`はContentとBorderの間にある内側の余白です。背景色はPaddingまで広がるため、文字とCardの端を離すときに使います。

![Card内側のPadding](asset:spacing-padding)

実習では`.card`の`padding: 16px;`を`24px`へ変えます。Card同士の距離にはPaddingを使いません。

```css
.card {
  padding: 24px;
}
```

:::practice
prompt: 文字とCard背景の端を離すPropertyを選びます。
expectedAction: Box内部の距離なのでpaddingと答える
estimatedMinutes: 2
:::

次は、Card同士の外側を離すPropertyを見ます。
