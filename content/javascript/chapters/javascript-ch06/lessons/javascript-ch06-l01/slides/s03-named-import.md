---
id: javascript-ch06-l01-s03
title: importで公開名を受け取る
kind: code
concept: named import
layout: comparison
teachesConceptIds: [named-import]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 4, maxVisuals: 1 }
assets: []
---

`main.js`では波括弧へ公開名を書き、`./questions.js`から受け取ります。`./`は現在のFileと同じ場所を基準にする相対pathです。

```js
import { questions } from './questions.js';

console.log(questions.length);
```

公開した名前と受け取る名前を同じにします。この教材ではWorkspace内の相対importだけを使います。

:::practice
prompt: questionsを受け取る波括弧内の名前を答えます。
expectedAction: questionsと答える
estimatedMinutes: 1
:::
