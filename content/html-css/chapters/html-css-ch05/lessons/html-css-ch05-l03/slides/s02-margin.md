---
id: html-css-ch05-l03-s02
title: marginはBox同士の外側を離す
kind: comparison
concept: margin-spacing
layout: code-preview
teachesConceptIds: [margin-property]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: spacing-margin
    source: assets/spacing-ownership.svg
    mediaType: image
    alt: 2枚のCard間にあるMargin 32pxを強調した図
    provenanceId: ch05-spacing-ownership-original
---

`margin`はBorderの外側にあり、Box同士の距離を作ります。背景色はMarginへ広がりません。

![Card外側のMargin](asset:spacing-margin)

実習では、2枚目以降だけを選ぶ`.card + .card`が用意されています。`margin-top: 16px;`を`32px`へ変えます。

```css
.card + .card {
  margin-top: 32px;
}
```

:::practice
prompt: Card内24pxとCard間32pxをどのPropertyへ割り当てるか答えます。
expectedAction: 内側はpadding、外側はmarginと分類する
estimatedMinutes: 2
:::

次の実習では、PaddingとMarginを1箇所ずつ変更します。
