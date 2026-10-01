---
id: typescript-ch01-l02-s01
title: 変数に受け取る型を書く
kind: concept
concept: numberの型注釈
layout: comparison
teachesConceptIds: [typescript-number-annotation]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

変数名の後ろに型を書くことを型注釈といいます。`number`は数値の型です。

```ts
let score: number = 0;
score = 2;
console.log(score);
```

`score`が変数名、`: number`が受け取る型、`= 0`が最初の値です。後から入れる2も数値なので、この約束に合います。

:::practice
prompt: 型を表す部分と、最初の値を表す部分はどこですか。
expectedAction: 型はnumber、最初の値は0と答える
estimatedMinutes: 1
:::
