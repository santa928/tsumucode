---
id: javascript-ch04-l03-s02
title: ofの右側へ読むArrayを書く
kind: concept
concept: for...of文
layout: comparison
teachesConceptIds: [for-of-statement]
masteryTarget: read
screenBudget: { maxTextCharacters: 250, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

`for...of`では、`of`の右側へ読むArrayを書き、左側へ要素を一時的に受け取る変数を書きます。

```js
for (const question of questions) {
  console.log(question);
}
```

波括弧の処理は、questionsの要素数だけ繰り返されます。

:::practice
prompt: 読むArrayが書かれている側を答えます。
expectedAction: ofの右側と答える
estimatedMinutes: 1
:::
