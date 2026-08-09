---
id: javascript-ch03-l02-s03
title: returnで計算結果を返す
kind: concept
concept: return
layout: comparison
teachesConceptIds: [return-value]
masteryTarget: read
screenBudget: { maxTextCharacters: 260, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

`return`の右に値を書くと、その値をFunctionの呼び出し結果として返せます。返された値は変数へ入れたり、Consoleへ渡したりできます。

```js
return correctAnswers * pointsPerAnswer;
```

`return`へ到達すると、そのFunctionの実行はそこで終わります。

:::practice
prompt: returnの右側に置くものを答えます。
expectedAction: 呼び出し元へ返したい値と答える
estimatedMinutes: 1
:::
