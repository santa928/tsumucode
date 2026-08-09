---
id: javascript-ch04-l02-s03
title: atの丸括弧へindexを渡す
kind: concept
concept: at method
layout: comparison
teachesConceptIds: [array-at-method]
masteryTarget: read
screenBudget: { maxTextCharacters: 260, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

`.at()`でも要素を取り出せます。丸括弧の中へindexを渡します。この教材では非負整数だけを使います。

```js
questions[1];
questions.at(1);
// どちらも2問目
```

角括弧と`.at()`は書き方が違っても、ここでは同じ位置を読み取ります。

:::practice
prompt: 2問目をatで取り出す書き方を答えます。
expectedAction: questions.at(1)と答える
estimatedMinutes: 1
:::
