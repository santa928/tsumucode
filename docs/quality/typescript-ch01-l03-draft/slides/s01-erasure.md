---
id: typescript-ch01-l03-s01
title: 型注釈は生成したJSに残らない
kind: concept
concept: 型注釈は生成したJSに残らない
layout: comparison
teachesConceptIds:
  - typescript-type-erasure
masteryTarget: read
screenBudget:
  maxTextCharacters: 300
  maxCodeLines: 4
  maxVisuals: 0
assets: []
---

変数名の後ろの型注釈を復習します。こちらは書いたTypeScriptです。

```ts
let score: number = 2;
console.log(score);
```

ブラウザが実行するJavaScriptでは、型注釈の`: number`が取り除かれます。これを型消去といいます。

```js
let score = 2;
console.log(score);
```

値を入れる処理と表示する処理は残っています。

:::practice
prompt: 取り除かれた部分と、残った処理はどこですか。
expectedAction: 型注釈が消え、代入と表示は残ると答える
estimatedMinutes: 1
:::
