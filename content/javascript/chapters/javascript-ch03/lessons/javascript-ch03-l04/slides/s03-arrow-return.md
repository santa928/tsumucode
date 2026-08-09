---
id: javascript-ch03-l04-s03
title: 波括弧の中から値をreturnする
kind: concept
concept: Arrow Functionのreturn
layout: comparison
teachesConceptIds: [arrow-return]
masteryTarget: read
screenBudget: { maxTextCharacters: 270, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

波括弧を持つArrow Functionでは、Function宣言と同じように`return`で結果を返します。

```js
return '回答: ' + answer;
```

文字列とparameterを`+`でつなぐと、呼び出すたびに渡された回答を整形できます。

:::practice
prompt: answerがBなら返る文字列を答えます。
expectedAction: '回答: Bと答える'
estimatedMinutes: 1
:::
