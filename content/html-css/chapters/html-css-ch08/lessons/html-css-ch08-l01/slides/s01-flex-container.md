---
id: html-css-ch08-l01-s01
title: 親にdisplay flexを書く
kind: concept
concept: flex-container-items
layout: code-preview
teachesConceptIds: [flex-container, css-attribute-selector]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: flex-container-axis
    source: assets/diagram-flex-axis.svg
    mediaType: image
    alt: 親のFlex Container内に3つの直接の子Itemが並ぶ図
    provenanceId: ch08-flex-axis-slide-original
---

`display: flex;`を親Elementへ書くと、直接の子がFlex Itemになります。並べたい3つの`span`ではなく、それらを包む親をContainerにします。

![親Containerと3つの直接の子Item](asset:flex-container-axis)

```css
[data-row] {
  display: flex;
}
```

`[data-row]`は、`data-row`属性を持つElementを選ぶ属性Selectorです。中括弧`[]`の外へDeclarationを書かないよう、SelectorとRuleの範囲を分けて読みます。

:::practice
prompt: data-row属性を持つ親をFlex Containerにする1行を読み上げます。
expectedAction: 属性Selector data-rowのRuleへdisplay flexを書くと答える
estimatedMinutes: 2
:::

次は、ContainerがItemを並べる向きを決めます。
