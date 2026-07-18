---
id: html-css-ch08-l03-s02
title: align-selfは1つのItemだけ揃え方を上書きする
kind: comparison
concept: align-self
assets: []
---

`align-self`は特定のFlex ItemだけCross Axisの位置を変えます。Containerの`align-items: center`を保ちながら、補助Actionだけ`flex-end`へ置けます。

個別指定を増やしすぎるとLayoutの意図が読みにくくなります。全体の原則をContainerへ置き、例外だけをItemへ置きます。

:::practice
prompt: 全体を中央にしたまま1 ItemだけCross Endへ置く2つのDeclarationを答えます。
expectedAction: 親へalign-items center、対象へalign-self flex-endと答える
estimatedMinutes: 2
:::

次の実習ではComputed Styleと実測位置を組み合わせます。
