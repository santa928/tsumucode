---
id: html-css-ch08-l03-s02
title: align-selfは1つのItemだけ揃え方を上書きする
kind: comparison
concept: align-self
layout: code-preview
teachesConceptIds: [align-self]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: cross-axis-alignment-detail
    source: assets/cross-axis-alignment.svg
    mediaType: image
    alt: 全Itemの中央揃えと例外ItemのCross End配置を比較する図
    provenanceId: ch08-cross-axis-alignment-original
---

`align-self`は特定のFlex ItemだけCross Axisの位置を変えます。Containerの`align-items: center`を保ちながら、補助Actionだけ`flex-end`へ置けます。

![全体の中央揃えと1つの例外](asset:cross-axis-alignment-detail)

個別指定を増やしすぎるとLayoutの意図が読みにくくなります。全体の原則をContainerへ置き、例外だけをItemへ置きます。

```css
[data-end] {
  align-self: flex-end;
}
```

:::practice
prompt: 全体を中央にしたまま1 ItemだけCross Endへ置く2つのDeclarationを答えます。
expectedAction: 親へalign-items center、対象へalign-self flex-endと答える
estimatedMinutes: 2
:::

次の実習では、既存の`flex-start`と`center`を今読んだValueへ変えます。
