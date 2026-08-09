---
id: javascript-ch03-l03-s03
title: Function内の変数はlocalになる
kind: concept
concept: local Scope
layout: comparison
teachesConceptIds: [local-scope]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

Functionの内側で宣言した変数は、そのFunctionのlocal Scopeにあります。Functionの処理中は使えますが、外側からは使えません。

```js
function showLesson() {
  const lessonName = 'Scope';
  console.log(lessonName);
}
```

この変数が必要なのは`showLesson`の内側だけです。

:::practice
prompt: local変数を使える場所を答えます。
expectedAction: 宣言したFunctionの内側と答える
estimatedMinutes: 1
:::
