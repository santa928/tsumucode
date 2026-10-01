---
id: typescript-ch01-l01-s01
title: 最初の値から型を判断する
kind: concept
concept: 数値からの型推論
layout: comparison
teachesConceptIds: [typescript-number-inference]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

TypeScriptはJavaScriptに型の確認を加えた言語です。型は値の種類で、`number`は数値の型です。

```ts
let score = 0;
score = 2;
console.log(score);
```

最初に入れる値を初期値といいます。TypeScriptは初期値の0から、`score`を数値の型と判断します。このように型を判断する仕組みが型推論です。型を自分で書かなくても確認が働きます。Consoleには2が表示されます。

:::practice
prompt: scoreの型を判断する手がかりになった値はどれですか。
expectedAction: 最初に入れた数値の0と答える
estimatedMinutes: 1
:::
