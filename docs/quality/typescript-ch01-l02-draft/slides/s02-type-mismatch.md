---
id: typescript-ch01-l02-s02
title: 型注釈は値を変換しない
kind: comparison
concept: 数値と文字列の型不一致
layout: comparison
teachesConceptIds: [typescript-number-annotation]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 1, maxVisuals: 0 }
assets: []
---

次の行は型の確認で止まります。`: number`を書いても、文字列が自動で数値になるわけではありません。

```ts
let score: number = '2';
```

引用符で囲まれた`'2'`は文字列です。一重の`'`でも二重の`"`でも、囲まれた値は文字列になります。数値を受け取る約束と、渡した値の型を見比べます。

:::practice
prompt: この行にnumberと書いてあるので、文字列は数値へ変わりますか。
expectedAction: 変わらず、数値の型と文字列の値が合わないと答える
estimatedMinutes: 1
:::
