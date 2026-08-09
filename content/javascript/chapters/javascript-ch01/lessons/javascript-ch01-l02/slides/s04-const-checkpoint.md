---
id: javascript-ch01-l02-s04
title: constの右側だけを完成させる
kind: concept
concept: const変数からの出力
layout: code-preview
teachesConceptIds: [const-console-output]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 2, maxVisuals: 1 }
assets:
  - id: javascript-ch01-l02-variable-checkpoint
    source: assets/variable-flow.svg
    mediaType: image
    alt: questionTextの値をConsoleへ読み出す完成手順の確認図
    provenanceId: javascript-ch01-l02-variable-flow-original
---

演習では変数名とConsole出力が用意されています。1行目の引用符内だけを直します。

```js
const questionText = '問題2を始めます';
console.log(questionText);
```

`const`、`questionText`、2行目はそのまま残します。表示を直接書くのではなく、変数から読み出します。

![const変数からConsoleへ値を渡す流れ](asset:javascript-ch01-l02-variable-checkpoint)

:::practice
prompt: 変更する1箇所を確認します。
expectedAction: 1行目の引用符内だけと答える
estimatedMinutes: 1
:::
