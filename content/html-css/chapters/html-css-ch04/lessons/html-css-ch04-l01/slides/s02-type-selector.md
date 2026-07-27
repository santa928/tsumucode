---
id: html-css-ch04-l01-s02
title: Type Selectorは同じ種類のElementへ届く
kind: concept
concept: type-selector
layout: code-preview
teachesConceptIds: [type-selector]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: css-type-selector-map
    source: assets/css-rule-map.svg
    mediaType: image
    alt: p Type Selectorがintroとaccent両方のParagraphへ届く図
    provenanceId: ch04-css-rule-map-original
---

Type Selectorは`p`や`h2`のようなTag名で選び、同じ種類すべてへ共通Styleを届けます。

```css
p {
  color: #2d5d62;
}
```

![pが2つのParagraphへ届く範囲](asset:css-type-selector-map)

実習の`p` Ruleはintroとaccentの両方へ届き、まず2つを青緑にします。1つだけ変えたい場面では範囲が広いため、次のClass Selectorで一部を上書きします。

:::practice
prompt: introとaccentの両方へ届くSelectorをCodeから選びます。
expectedAction: pを選び、Class名に関係なく2つへ届くと説明する
estimatedMinutes: 2
:::

次は、一部だけを選ぶClass Selectorを使います。
