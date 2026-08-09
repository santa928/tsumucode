---
id: javascript-ch05-l01-s03
title: 変換結果は新しいArrayになる
kind: comparison
concept: mapが返すArray
layout: comparison
teachesConceptIds: [map-result-array]
masteryTarget: read
screenBudget: { maxTextCharacters: 270, maxCodeLines: 7, maxVisuals: 0 }
assets: []
---

`map`はcallbackの戻り値を順番に集めます。元が3件なら、結果も3件です。元の`questions`は書き換えません。

```js
const questions = ['HTMLとは？', 'CSSとは？'];
const labels = questions.map((question) => {
  return `問題: ${question}`;
});

console.log(questions[0]); // HTMLとは？
console.log(labels[0]); // 問題: HTMLとは？
```

:::practice
prompt: mapの前後でArrayの件数がどうなるか答えます。
expectedAction: 元と同じ件数の新しいArrayになると答える
estimatedMinutes: 1
:::
