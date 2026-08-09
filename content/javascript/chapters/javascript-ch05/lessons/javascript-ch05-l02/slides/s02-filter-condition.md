---
id: javascript-ch05-l02-s02
title: trueを返した要素が残る
kind: code
concept: filterの条件
layout: comparison
teachesConceptIds: [filter-condition]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

`filter`のcallbackは、現在の要素を残すなら`true`、外すなら`false`を返します。比較式はそのままbooleanになります。

```js
const htmlQuestions = questions.filter((question) => {
  return question.category === 'HTML';
});
```

`category`が`HTML`と同じObjectだけが残ります。

:::practice
prompt: CSS categoryの要素で比較式が返す値を答えます。
expectedAction: falseと答える
estimatedMinutes: 1
:::
