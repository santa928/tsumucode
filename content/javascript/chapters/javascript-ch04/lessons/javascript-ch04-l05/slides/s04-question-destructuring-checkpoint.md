---
id: javascript-ch04-l05-s04
title: ObjectとArrayを2段階で分ける
kind: concept
concept: 問題データのDestructuring
layout: code-preview
teachesConceptIds: [question-destructuring]
masteryTarget: transform
screenBudget: { maxTextCharacters: 310, maxCodeLines: 10, maxVisuals: 1 }
assets:
  - id: javascript-ch04-l05-destructuring-flow
    source: assets/destructuring-flow.svg
    mediaType: image
    alt: quiz Objectからpromptとchoicesを取り出し、choicesから先頭要素を取り出す流れ
    provenanceId: javascript-ch04-l05-destructuring-flow-original
---

演習は2手順です。Object Destructuringの右側を`quiz`へ、Array Destructuringの右側を`choices`へ変えます。

```js
const quiz = {
  text: '2 + 3 は？',
  choices: ['3', '5', '7'],
};

const { text: prompt, choices } = quiz;
const [firstChoice] = choices;

console.log(prompt);
console.log(firstChoice);
```

![ObjectとArrayを2段階でDestructuringする流れ](asset:javascript-ch04-l05-destructuring-flow)

Consoleへ問題文、その次に先頭の選択肢`3`が表示されます。

:::practice
prompt: 2つの右辺と表示結果を答えます。
expectedAction: quizとchoicesへ置き換え、問題文と3を表示すると答える
estimatedMinutes: 1
:::
