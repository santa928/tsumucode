---
id: javascript-ch05-l02-s03
title: 選んだ要素で新しいArrayを作る
kind: comparison
concept: filterが返すArray
layout: comparison
teachesConceptIds: [filter-result-array]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 7, maxVisuals: 0 }
assets: []
---

`filter`は条件に合った要素を、元と同じ順番で新しいArrayへ入れます。0件のときも結果は空のArrayです。元の`questions`は変わりません。

```js
const htmlQuestions = questions.filter((question) => {
  return question.category === 'HTML';
});

console.log(questions.length); // 3
console.log(htmlQuestions.length); // 2
```

:::practice
prompt: 元が3件、条件に合うものが2件なら結果は何件か答えます。
expectedAction: 2件と答える
estimatedMinutes: 1
:::
