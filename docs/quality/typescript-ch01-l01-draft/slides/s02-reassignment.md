---
id: typescript-ch01-l01-s02
title: 違う種類の値は実行前に止まる
kind: comparison
concept: 推論した型と再代入
layout: comparison
teachesConceptIds: [typescript-number-inference]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

次のコードは2行目の型確認で止まり、実行されません。

```ts
let score = 0;
score = '2';
console.log(score);
```

引用符で囲んだ`'2'`は文字列で、数値の2とは種類が違います。文字列の型の名前は`string`です。最初に数値から判断された`score`へ、後から文字列は入れられません。値を入れ直すたびに、型が自由に変わるわけではありません。

:::practice
prompt: 型の確認が止まる理由を、最初の値と2行目の値で説明しましょう。
expectedAction: 最初は数値の0なので、文字列の2を後から入れられないと答える
estimatedMinutes: 1
:::
