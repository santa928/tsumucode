---
id: javascript-ch05-l04-s02
title: mapで新しいArrayを組み立てる
kind: code
concept: mapによるArray更新
layout: comparison
teachesConceptIds: [array-map-update]
masteryTarget: read
screenBudget: { maxTextCharacters: 270, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

`map`は元Arrayを書き換えず、callbackの戻り値から新しいArrayを作ります。更新後のArrayへ別の変数名を付けます。

```js
const answeredQuestions = questions.map((question) => {
  return {
    ...question,
    answered: true,
  };
});
```

:::practice
prompt: 更新後のArrayを受け取る変数名を答えます。
expectedAction: answeredQuestionsと答える
estimatedMinutes: 1
:::
