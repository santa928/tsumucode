---
id: javascript-ch01-l03-s03
title: 名前を使って得点を計算する
kind: code
concept: 変数を使う演算
layout: code-preview
teachesConceptIds: [calculated-binding]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: javascript-ch01-l03-score-flow
    source: assets/score-flow.svg
    mediaType: image
    alt: 問題数3と1問10点を掛け、totalScoreへ30を入れる図
    provenanceId: javascript-ch01-l03-score-flow-original
---

数値へ名前をつけると、式の意味を読みやすくできます。

```js
const questionCount = 3;
const pointPerQuestion = 10;
const totalScore = questionCount * pointPerQuestion;
console.log(totalScore);
```

`totalScore`は「問題数 × 1問の点数」という意味で読めます。

![問題数と点数から合計を作る流れ](asset:javascript-ch01-l03-score-flow)

:::practice
prompt: 計算に使う2つの変数名を探します。
expectedAction: questionCountとpointPerQuestionを指す
estimatedMinutes: 1
:::
