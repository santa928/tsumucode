---
id: javascript-ch03-l05-s02
title: 完成例で10から20への変化を見る
kind: concept
concept: 外側と内側のFunction
layout: comparison
teachesConceptIds: [outer-inner-function]
masteryTarget: read
screenBudget: { maxTextCharacters: 340, maxCodeLines: 11, maxVisuals: 0 }
assets: []
---

次はそのまま実行できる完成例です。外側のcreateScoreCounterを1回呼び、返された内側の関数をcounterに入れます。

```js {"label":"script.js・完成例", "role":"input", "highlightedLines":[2,4,7]}
function createScoreCounter() {
  let score = 0;
  const addScore = function () {
    score += 10;
    return score;
  };
  return addScore;
}
const counter = createScoreCounter();
console.log(counter(), counter());
```

```text {"label":"Console", "role":"output"}
10 20
```

2行目は係を作るときだけ0にします。4行目は呼ぶたびに10を足します。7行目のreturn addScoreは関数そのものを返し、まだ呼びません。return addScore()ならその場で呼び、数値を返すので意味が違います。

:::practice
prompt: counter()を2回呼んだとき、scoreを0へ戻す行も2回動くか考えます。
expectedAction: 外側は1回だけなので、0へ戻す行は繰り返さないと答える
estimatedMinutes: 1
:::
