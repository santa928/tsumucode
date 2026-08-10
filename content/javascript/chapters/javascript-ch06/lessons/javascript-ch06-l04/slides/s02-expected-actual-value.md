---
id: javascript-ch06-l04-s02
title: 期待値と実際値をConsoleで並べる
kind: code
concept: 期待値と実際値
layout: comparison
teachesConceptIds: [expected-actual-value]
masteryTarget: read
screenBudget: { maxTextCharacters: 290, maxCodeLines: 5, maxVisuals: 1 }
assets: []
---

期待値は「正しく動けば得たい値」、実際値は「今のコードで得た値」です。同じ場所へ表示すると差が見えます。

```js
const totalScore = questionCount * pointsPerQuestion;

console.log('期待値:', 30);
console.log('実際値:', totalScore);
```

`期待値: 30`、`実際値: 20`なら、計算に使う値を確認します。

:::practice
prompt: 今の差を数値で答えます。
expectedAction: 期待値30、実際値20と答える
estimatedMinutes: 1
:::
