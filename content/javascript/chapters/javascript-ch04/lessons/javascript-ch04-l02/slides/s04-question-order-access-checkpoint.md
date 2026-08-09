---
id: javascript-ch04-l02-s04
title: 1問目と2問目を順に表示する
kind: concept
concept: 問題文の順番指定
layout: code-preview
teachesConceptIds: [question-order-access]
masteryTarget: transform
screenBudget: { maxTextCharacters: 270, maxCodeLines: 8, maxVisuals: 1 }
assets:
  - id: javascript-ch04-l02-index-access-flow
    source: assets/index-access-flow.svg
    mediaType: image
    alt: index 0でHTML、at 1でCSSを順に取り出す流れ
    provenanceId: javascript-ch04-l02-index-access-flow-original
---

演習では、最初の表示行にある`questions[1]`の数値だけを`0`へ変えます。2行目の`questions.at(1)`は完成しています。

```js
const questions = ['HTMLの役割は？', 'CSSの役割は？', 'JavaScriptの役割は？'];

console.log(questions[0]);
console.log(questions.at(1));
```

![0と1の位置から問題を順に取り出す流れ](asset:javascript-ch04-l02-index-access-flow)

Consoleへ1問目、2問目の順に表示されれば成功です。

:::practice
prompt: 変更する数値と表示順を答えます。
expectedAction: 最初のindexを0にしてHTML、CSSの順に表示すると答える
estimatedMinutes: 1
:::
