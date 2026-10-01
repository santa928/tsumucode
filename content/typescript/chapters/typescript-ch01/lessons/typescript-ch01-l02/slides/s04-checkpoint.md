---
id: typescript-ch01-l02-s04
title: 変数の値を表示して確かめる
kind: concept
concept: 型と表示の両方を確認する
layout: checkpoint
teachesConceptIds: [typescript-number-annotation]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

演習では、数値の得点2を`score`に持たせます。最後は数値を直接書かず、変数の値を表示します。

```ts
let score: number = 0;
score = 2;
console.log(score);
```

「プレビューを更新」で型の案内が消え、Consoleに2が出たら「判定する」で課題の条件を確かめます。最初のコードには型の誤りがあるため、直すまでは実行されません。

:::practice
prompt: Consoleに2が出ること以外に、何を確かめますか。
expectedAction: scoreにnumberの型注釈があり、最後にscoreの値を表示していることと答える
estimatedMinutes: 1
:::
