---
id: javascript-ch03-l02-s04
title: 正解数と配点から合計点を返す
kind: concept
concept: 得点を計算するFunction
layout: code-preview
teachesConceptIds: [score-function]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: javascript-ch03-l02-score-flow
    source: assets/score-function-flow.svg
    mediaType: image
    alt: 3と10をparameterで受け取り、掛け算した30をreturnする流れ
    provenanceId: javascript-ch03-l02-score-flow-original
---

演習では、`return 0;`の0を2つのparameterの掛け算へ置き換えます。Function名、parameter、呼び出し行は変更しません。

```js
function calculateScore(correctAnswers, pointsPerAnswer) {
  return correctAnswers * pointsPerAnswer;
}

console.log(calculateScore(3, 10));
```

![3と10から30を返す流れ](asset:javascript-ch03-l02-score-flow)

:::practice
prompt: returnへ書く式とConsoleの結果を確認します。
expectedAction: correctAnswersとpointsPerAnswerを掛けると30になると答える
estimatedMinutes: 1
:::
