---
id: javascript-ch05-l04-s04
title: 回答前と回答後を両方確かめる
kind: concept
concept: 問題回答状態のimmutable update
layout: code-preview
teachesConceptIds: [question-answer-state]
masteryTarget: transform
screenBudget: { maxTextCharacters: 310, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: javascript-ch05-l04-immutable-flow
    source: assets/immutable-flow.svg
    mediaType: image
    alt: answeredがfalseの元Arrayを残し、mapとObject spreadでtrueの新しいArrayを作る流れ
    provenanceId: javascript-ch05-l04-immutable-flow-original
---

演習では新しいObjectの`answered`を`true`へ変更します。元データは触りません。

```js
const answeredQuestions = questions.map((question) => ({
  ...question,
  answered: true,
}));

console.log(questions[0].answered);
console.log(answeredQuestions[0].answered);
```

![元Arrayを残して回答済みの新しいArrayを作る流れ](asset:javascript-ch05-l04-immutable-flow)

Consoleが`false`、`true`の順なら完成です。

:::practice
prompt: 元と新しいObjectのansweredを順番に答えます。
expectedAction: false、trueと答える
estimatedMinutes: 1
:::
