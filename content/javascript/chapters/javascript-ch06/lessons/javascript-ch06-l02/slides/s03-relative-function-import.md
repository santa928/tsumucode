---
id: javascript-ch06-l02-s03
title: 相対pathからFunctionをimportする
kind: code
concept: 相対Function import
layout: comparison
teachesConceptIds: [relative-function-import]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 4, maxVisuals: 1 }
assets: []
---

`main.js`は`./score.js`から`scoreAnswer`をnamed importし、これまでと同じ形で呼び出します。

```js
import { scoreAnswer } from './score.js';

console.log(scoreAnswer(true));
```

この教材では外部package名ではなく、`./`で始まるWorkspace内の相対pathを使います。

:::practice
prompt: score.jsを示す相対pathを答えます。
expectedAction: ./score.jsと答える
estimatedMinutes: 1
:::
