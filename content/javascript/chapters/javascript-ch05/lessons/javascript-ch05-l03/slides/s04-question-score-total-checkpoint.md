---
id: javascript-ch05-l03-s04
title: 3問のpointを合計する
kind: concept
concept: 問題pointのreduce集計
layout: code-preview
teachesConceptIds: [question-score-total]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 8, maxVisuals: 1 }
assets:
  - id: javascript-ch05-l03-reduce-flow
    source: assets/reduce-flow.svg
    mediaType: image
    alt: 初期値0へ10点、20点、30点を順に加えて60点を作る流れ
    provenanceId: javascript-ch05-l03-reduce-flow-original
---

演習では`reduce`へ初期値`0`を追加します。callbackは完成済みです。

```js
const total = questions.reduce((sum, question) => {
  return sum + question.points;
}, 0);

console.log(total);
```

![初期値0から3問のpointを60へ集計する流れ](asset:javascript-ch05-l03-reduce-flow)

Consoleへ数値の`60`が表示されれば完成です。

:::practice
prompt: reduceの丸括弧へ最後に加える値を答えます。
expectedAction: callbackの後ろへ0を加えると答える
estimatedMinutes: 1
:::
