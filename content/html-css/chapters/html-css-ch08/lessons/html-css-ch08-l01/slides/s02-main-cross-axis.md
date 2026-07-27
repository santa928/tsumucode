---
id: html-css-ch08-l01-s02
title: DirectionがMain Axisの向きを決める
kind: diagram
concept: flex-main-cross-axis
layout: code-preview
teachesConceptIds: [flex-direction, main-cross-axis]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: diagram-flex-axis
    source: assets/diagram-flex-axis.svg
    mediaType: image
    alt: row方向でMain AxisとCross Axisを示すFlexbox図
    provenanceId: ch08-flex-axis-slide-original
---

`flex-direction`はMain Axisの向きを決めます。`row`は左→右、`column`は上→下がMain Axisで、Cross Axisはそれと直交します。

![Flexboxの2本のAxis](asset:diagram-flex-axis)

```css
[data-column] {
  flex-direction: column;
}
```

`row`は初期値です。実習では完成済みのSelectorを使い、親をContainerにする変更と`column`への変更だけを行います。

:::practice
prompt: flex-direction columnのとき、Main Axisが進む方向を答えます。
expectedAction: 上から下へ進む縦方向と答える
estimatedMinutes: 2
:::

次の実習では、今読んだ2つのDeclarationだけを変更します。
