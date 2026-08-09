---
id: javascript-ch01-l02-s03
title: 変数名から値を読み出す
kind: code
concept: 変数の参照
layout: code-preview
teachesConceptIds: [identifier-reference]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 2, maxVisuals: 1 }
assets:
  - id: javascript-ch01-l02-variable-flow
    source: assets/variable-flow.svg
    mediaType: image
    alt: questionTextという名前の箱から問題文を読み出してConsoleへ渡す図
    provenanceId: javascript-ch01-l02-variable-flow-original
---

変数名を値が必要な場所へ書くと、中に入っている値を使えます。

```js
const questionText = '問題2を始めます';
console.log(questionText);
```

2行目は`questionText`の中身を読み、Consoleへ`問題2を始めます`と表示します。

![変数から値を読み出す流れ](asset:javascript-ch01-l02-variable-flow)

:::practice
prompt: 2行目へ文字列を直接書いていない理由を答えます。
expectedAction: questionTextから値を読み出していると答える
estimatedMinutes: 1
:::
