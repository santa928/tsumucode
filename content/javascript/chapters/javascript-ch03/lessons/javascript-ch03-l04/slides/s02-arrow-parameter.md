---
id: javascript-ch03-l04-s02
title: 矢印の左側でparameterを受け取る
kind: concept
concept: Arrow Functionのparameter
layout: comparison
teachesConceptIds: [arrow-parameter]
masteryTarget: read
screenBudget: { maxTextCharacters: 260, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

`=>`の左側にある丸括弧へparameterを書きます。呼び出し時に渡した値を、波括弧の内側で`answer`として使えます。

```js
const formatAnswer = (answer) => {
  return answer;
};
```

:::practice
prompt: 受け取った値を表す名前を答えます。
expectedAction: answerと答える
estimatedMinutes: 1
:::
