---
id: javascript-ch05-l03-s03
title: 集計の開始値を明示する
kind: comparison
concept: reduceの初期値
layout: comparison
teachesConceptIds: [reduce-initial-value]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

callbackの後ろにある`0`は、最初の`sum`へ入る初期値です。合計は0から始める、とコードで明示します。

```js
const total = questions.reduce((sum, question) => {
  return sum + question.points;
}, 0);
```

初期値を省くと、最初のObjectが`sum`になり、数値の合計を正しく計算できません。空のArrayでも困らないよう、初期値を書きます。

:::practice
prompt: point合計の初期値を答えます。
expectedAction: 0と答える
estimatedMinutes: 1
:::
