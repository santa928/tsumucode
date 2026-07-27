---
id: html-css-ch04-l03-s02
title: SpecificityはSelectorがどれだけ具体的かを比べる
kind: comparison
concept: css-specificity
layout: code-preview
teachesConceptIds: [specificity]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 7, maxVisuals: 1 }
assets:
  - id: specificity-cascade
    source: assets/diagram-cascade.svg
    mediaType: image
    alt: SpecificityをSource Orderより先に比べるCSS Cascadeの図
    provenanceId: ch04-cascade-slide-original
---

同じElementへType SelectorとClass Selectorが届く場合、より具体的なClass SelectorのValueが選ばれます。

```css
p {
  color: #2d5d62;
}

.note {
  color: #9a3f25;
}
```

Ruleが効かないたびにSelectorを長くしたりimportantを足したりせず、どのRuleが届き、どのSpecificityを持つかを確認します。

![Specificityを先に比べる順序](asset:specificity-cascade)

実習の2つの`.cascade-card`はSelectorが完全に同じです。Specificityでは決まらないため、Source Orderへ進みます。

:::practice
prompt: 2つの.cascade-cardのSpecificityを比べます。
expectedAction: 同じ強さなのでSource Orderで決めると説明する
estimatedMinutes: 2
:::

次は、直接指定がないPropertyがParentから届くInheritanceを見ます。
