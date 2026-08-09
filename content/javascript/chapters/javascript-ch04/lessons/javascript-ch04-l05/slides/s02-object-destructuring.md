---
id: javascript-ch04-l05-s02
title: 波括弧でpropertyを取り出す
kind: concept
concept: Object Destructuring
layout: comparison
teachesConceptIds: [object-destructuring]
masteryTarget: read
screenBudget: { maxTextCharacters: 270, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

Object Destructuringでは、左辺の波括弧へ取り出したいproperty名を書きます。colonの後ろへ別名を書くこともできます。

```js
const quiz = {
  text: '2 + 3 は？',
  choices: ['3', '5', '7'],
};

const { text: prompt, choices } = quiz;
```

`text`の値は`prompt`、`choices`の値は同名の変数へ入ります。

:::practice
prompt: textの値を受け取る変数名を答えます。
expectedAction: promptと答える
estimatedMinutes: 1
:::
