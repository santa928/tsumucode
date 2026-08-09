---
id: javascript-ch04-l04-s04
title: answerの値を正しい数値へ直す
kind: concept
concept: 問題Object
layout: code-preview
teachesConceptIds: [question-object]
masteryTarget: transform
screenBudget: { maxTextCharacters: 280, maxCodeLines: 7, maxVisuals: 1 }
assets:
  - id: javascript-ch04-l04-object-answer-flow
    source: assets/object-answer-flow.svg
    mediaType: image
    alt: quiz Objectのanswerを0から5へ直して表示する流れ
    provenanceId: javascript-ch04-l04-object-answer-flow-original
---

演習では、`answer: 0`の数値だけを計算結果の`5`へ変えます。property名と表示行は変更しません。

```js
const quiz = {
  question: '2 + 3 は？',
  answer: 5,
};

console.log(quiz.question);
console.log(quiz.answer);
```

![answer propertyを5へ直す流れ](asset:javascript-ch04-l04-object-answer-flow)

Consoleへ問題文、その次に正解`5`が表示されます。

:::practice
prompt: 変更するpropertyと値を答えます。
expectedAction: answerの0を5へ変えると答える
estimatedMinutes: 1
:::
