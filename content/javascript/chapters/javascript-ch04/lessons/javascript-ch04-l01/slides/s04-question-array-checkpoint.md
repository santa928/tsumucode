---
id: javascript-ch04-l01-s04
title: 3問目をArrayの末尾へ追加する
kind: concept
concept: 問題文のArray
layout: code-preview
teachesConceptIds: [question-array]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 8, maxVisuals: 1 }
assets:
  - id: javascript-ch04-l01-array-append-flow
    source: assets/array-append-flow.svg
    mediaType: image
    alt: 2問のArrayの末尾へJavaScriptの問題を加えて3問にする流れ
    provenanceId: javascript-ch04-l01-array-append-flow-original
---

演習では、2問が入ったArrayの末尾へ`'JavaScriptの役割は？',`を1行追加します。ほかの行は変更しません。

```js
const questions = ['HTMLの役割は？', 'CSSの役割は？', 'JavaScriptの役割は？'];

console.log(questions);
console.log(questions.length);
```

![Arrayの末尾へ3問目を追加する流れ](asset:javascript-ch04-l01-array-append-flow)

Consoleには3問のArray、その次に件数`3`が表示されます。

:::practice
prompt: 追加する場所と確認結果を答えます。
expectedAction: 角括弧の内側の末尾へ1行加え、件数3を確認すると答える
estimatedMinutes: 1
:::
