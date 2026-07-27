---
id: html-css-ch08-l03-s01
title: align-itemsは全ItemをCross Axisへ揃える
kind: concept
concept: align-items
layout: code-preview
teachesConceptIds: [align-items]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: cross-axis-alignment
    source: assets/cross-axis-alignment.svg
    mediaType: image
    alt: 高さの違うItemをCross Axis中央とEndへ揃える図
    provenanceId: ch08-cross-axis-alignment-original
---

`align-items`はContainer内のすべてのItemをCross Axisへ揃えます。高さの違うItemを`center`へ置くと、それぞれの中央がContainerの中央線へ合います。

![Cross Axisの全体配置と例外](asset:cross-axis-alignment)

```css
[data-align] {
  align-items: center;
}
```

`row`のCross Axisは縦方向です。高さ200pxのContainerに高さ60pxのItemを中央配置すると、上下の余白は70pxずつです。

:::practice
prompt: row方向のContainerで高さの違うItemを縦中央へ揃える値を答えます。
expectedAction: align-items centerと答える
estimatedMinutes: 2
:::

次は、全体の原則を保ったまま1つだけ例外にします。
