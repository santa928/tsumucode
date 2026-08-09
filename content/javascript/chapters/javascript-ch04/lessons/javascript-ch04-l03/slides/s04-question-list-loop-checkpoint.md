---
id: javascript-ch04-l03-s04
title: 空のArrayをquestionsへ置き換える
kind: concept
concept: 問題一覧のfor...of
layout: code-preview
teachesConceptIds: [question-list-loop]
masteryTarget: transform
screenBudget: { maxTextCharacters: 290, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: javascript-ch04-l03-for-of-flow
    source: assets/for-of-flow.svg
    mediaType: image
    alt: questionsの3問をfor ofで1問ずつ順番に表示する流れ
    provenanceId: javascript-ch04-l03-for-of-flow-original
---

演習の`for (const question of [])`は、空のArrayを読んでいるため1回も実行されません。`[]`だけを`questions`へ置き換えます。

```js
const questions = ['HTMLの役割は？', 'CSSの役割は？', 'JavaScriptの役割は？'];

for (const question of questions) {
  console.log(question);
}
```

![questionsをfor ofで1問ずつ読む流れ](asset:javascript-ch04-l03-for-of-flow)

Consoleへ3問が上から順に表示されます。

:::practice
prompt: ofの右側へ置く名前と結果を答えます。
expectedAction: questionsへ置き換えると3問が順に表示されると答える
estimatedMinutes: 1
:::
