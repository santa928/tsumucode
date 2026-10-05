---
id: typescript-ch01-l03-s01
title: 型注釈は生成したJSに残らない
kind: concept
concept: 型注釈は生成したJSに残らない
layout: code-preview
teachesConceptIds:
  - typescript-type-erasure
masteryTarget: read
screenBudget:
  maxTextCharacters: 300
  maxCodeLines: 4
  maxVisuals: 1
assets:
  - id: typescript-ch01-l03-erasure-flow
    source: assets/erasure-flow.svg
    mediaType: image
    alt: TypeScriptから型注釈だけを取り除き、JavaScriptに残った代入と表示を実行するとConsoleに2が出る。
    provenanceId: typescript-ch01-l03-erasure-flow-original
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

![型注釈の消去と残る処理](asset:typescript-ch01-l03-erasure-flow)

:::practice
prompt: 取り除かれた部分と、残った処理はどこですか。
expectedAction: 型注釈が消え、代入と表示は残ると答える
estimatedMinutes: 1
:::
