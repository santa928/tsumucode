---
id: javascript-ch06-l02-s04
title: import名を完成させて10点を表示する
kind: concept
concept: 採点Function Module
layout: code-preview
teachesConceptIds: [score-function-module]
masteryTarget: transform
screenBudget: { maxTextCharacters: 290, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: javascript-ch06-l02-score-module-flow
    source: assets/score-module-flow.svg
    mediaType: image
    alt: score.jsでexportしたscoreAnswerをmain.jsでimportし、10を表示する流れ
    provenanceId: javascript-ch06-l02-score-module-flow-original
---

演習では`main.js`のimportにある空の波括弧へ`scoreAnswer`だけを書きます。`score.js`と呼び出しは完成しています。

```js
import { scoreAnswer } from './score.js';

console.log(scoreAnswer(true));
```

![採点FunctionをModule間で共有する流れ](asset:javascript-ch06-l02-score-module-flow)

Consoleへ`10`と表示されたら完成です。

:::practice
prompt: importの波括弧へ入れる名前を答えます。
expectedAction: scoreAnswerと答える
estimatedMinutes: 1
:::
