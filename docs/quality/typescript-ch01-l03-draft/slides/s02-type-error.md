---
id: typescript-ch01-l03-s02
title: 型の誤りは実行の前に直す
kind: concept
concept: 型の誤りは実行の前に直す
layout: comparison
teachesConceptIds:
  - typescript-type-erasure
masteryTarget: read
screenBudget:
  maxTextCharacters: 300
  maxCodeLines: 2
  maxVisuals: 0
assets: []
---

`number`は数値、引用符で囲んだ値は文字列です。この例は型が合いません。

```ts
let score: number = '2';
console.log(score);
```

TsumuCodeでは型の案内が出て、まだ実行・採点されません。型の誤りがあるときにJavaScriptを出すかは設定次第です。この教材の設定では出しません。

:::practice
prompt: 表示の処理へ進む前に、どの値を直しますか。
expectedAction: 引用符で囲んだ文字列を数値2に直すと答える
estimatedMinutes: 1
:::
