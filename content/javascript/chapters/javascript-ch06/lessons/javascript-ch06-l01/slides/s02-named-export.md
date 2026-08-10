---
id: javascript-ch06-l01-s02
title: exportで共有する名前を公開する
kind: code
concept: named export
layout: comparison
teachesConceptIds: [named-export]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 5, maxVisuals: 1 }
assets: []
---

`questions.js`では、別Moduleから使わせたい`questions`の前へ`export`を書きます。

```js
export const questions = [{ text: 'HTMLの役割は？' }, { text: 'CSSの役割は？' }];
```

名前を指定して公開するためnamed exportと呼びます。`const`とArrayの形はこれまでと同じです。

:::practice
prompt: 別Fileへquestionsを公開するkeywordを答えます。
expectedAction: exportと答える
estimatedMinutes: 1
:::
