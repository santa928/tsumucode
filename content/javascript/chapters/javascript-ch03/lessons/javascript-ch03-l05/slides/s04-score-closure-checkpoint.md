---
id: javascript-ch03-l05-s04
title: 2回の呼び出しで10から20へ進める
kind: concept
concept: 得点を覚えるClosure
layout: code-preview
teachesConceptIds: [score-closure]
masteryTarget: transform
screenBudget: { maxTextCharacters: 330, maxCodeLines: 8, maxVisuals: 1 }
assets:
  - id: javascript-ch03-l05-closure-flow
    source: assets/closure-memory-flow.svg
    mediaType: image
    alt: 1つのClosureを2回呼び出し、scoreが0から10、20へ増える流れ
    provenanceId: javascript-ch03-l05-closure-memory-flow-original
---

演習では、内側Functionの`score += 0;`だけを`score += 10;`へ直します。`score`を外側へ移さず、同じClosureを2回呼びます。

```js
function createScoreCounter() {
  let score = 0;
  const addScore = function () {
    score += 10;
    return score;
  };
  return addScore;
}
```

![Closureがscoreを0から10、20へ進める流れ](asset:javascript-ch03-l05-closure-flow)

:::practice
prompt: 変更する数値と2回の結果を確認します。
expectedAction: 0を10へ変えると10、20の順に表示されると答える
estimatedMinutes: 1
:::
