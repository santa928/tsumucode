---
id: javascript-ch04-l04-s03
title: dotの後ろへproperty名を書く
kind: concept
concept: dot access
layout: comparison
teachesConceptIds: [property-access]
masteryTarget: read
screenBudget: { maxTextCharacters: 250, maxCodeLines: 4, maxVisuals: 0 }
assets: []
---

Object名、dot、property名の順に書くと、目的の値を読み取れます。これをdot accessと呼びます。

```js
console.log(quiz.question);
console.log(quiz.answer);
```

`quiz.question`は問題文、`quiz.answer`は正解を返します。property名は引用符で囲みません。

:::practice
prompt: quizから正解を読む書き方を答えます。
expectedAction: quiz.answerと答える
estimatedMinutes: 1
:::
