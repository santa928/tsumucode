---
id: html-css-ch06-l03-s01
title: Custom Propertyをrootへ宣言する
kind: code
concept: custom-property-declaration
layout: code-preview
teachesConceptIds: [custom-property-root]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: custom-property-root
    source: assets/custom-property-flow.svg
    mediaType: image
    alt: rootのPrimary ColorをActionとTagへ届ける流れの図
    provenanceId: ch06-custom-property-flow-original
---

Custom Propertyは`--`から始まる名前で値を保持します。Document全体で共有する値は`:root`へ宣言します。

![rootから2つの部品へ値を届ける流れ](asset:custom-property-root)

実習の`:root`には記入場所のCommentがあります。その下へ`--color-primary: #2d5d62;`を1行追加します。

```css
:root {
  --color-primary: #2d5d62;
}
```

:::practice
prompt: 主要色をDocument全体で共有するCustom Property名を答えます。
expectedAction: --color-primaryのように役割で名付ける
estimatedMinutes: 2
:::

次は、宣言した値をvar関数で2回読みます。
