---
id: javascript-ch04-l05-s03
title: 角括弧で先頭要素を取り出す
kind: concept
concept: Array Destructuring
layout: comparison
teachesConceptIds: [array-destructuring]
masteryTarget: read
screenBudget: { maxTextCharacters: 250, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

Array Destructuringでは、左辺の角括弧へ先頭から順に変数名を書きます。

```js
const choices = ['3', '5', '7'];
const [firstChoice] = choices;

console.log(firstChoice);
// 3
```

変数名が1つなら、先頭要素だけを受け取ります。

:::practice
prompt: choicesの先頭要素を受け取る変数名を答えます。
expectedAction: firstChoiceと答える
estimatedMinutes: 1
:::
