---
id: html-css-ch04-l03-s01
title: 同じ強さのRuleは後のDeclarationが選ばれる
kind: diagram
concept: cascade-source-order
layout: code-preview
teachesConceptIds: [cascade-source-order]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 7, maxVisuals: 1 }
assets:
  - id: diagram-cascade
    source: assets/diagram-cascade.svg
    mediaType: image
    alt: Inheritance、Specificity、Source Orderを順に積みComputed Valueへ至る図
    provenanceId: ch04-cascade-slide-original
---

同じElement・Propertyへ、同じSpecificityのRuleが複数届くと、後のDeclarationが選ばれます。これがSource Orderです。

```css
.cascade-card {
  color: #2d5d62;
}
.cascade-card {
  color: #9a3f25;
}
```

![CSS Cascadeが値を選ぶ積層図](asset:diagram-cascade)

実習には`.cascade-card`が2回あります。同じSelectorなので、青緑を先、橙を後に置くとCardの最終Colorは橙になります。後が常に勝つのではなく、Specificityが同点のときの決め手です。

:::practice
prompt: 2つの.cascade-cardを青緑→橙の順にした最終色を予測します。
expectedAction: 後の橙を選び、同じSelectorだからだと説明する
estimatedMinutes: 2
:::

次は、Selectorの具体性によるSpecificityを比べます。
