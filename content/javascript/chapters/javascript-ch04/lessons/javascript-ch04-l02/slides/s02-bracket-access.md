---
id: javascript-ch04-l02-s02
title: 角括弧へindexを書いて取り出す
kind: concept
concept: 角括弧でのアクセス
layout: comparison
teachesConceptIds: [bracket-access]
masteryTarget: read
screenBudget: { maxTextCharacters: 250, maxCodeLines: 4, maxVisuals: 0 }
assets: []
---

Array名の直後の角括弧へindexを書くと、その位置の要素を取り出せます。

```js
const questions = ['HTMLの役割は？', 'CSSの役割は？'];

console.log(questions[0]);
// HTMLの役割は？
```

ここで`[0]`はArrayを作る角括弧ではなく、位置を指定する角括弧です。

:::practice
prompt: 1問目を取り出す書き方を答えます。
expectedAction: questions[0]と答える
estimatedMinutes: 1
:::
