---
id: javascript-ch06-l01-s04
title: questions.jsの問題数をmain.jsで確かめる
kind: concept
concept: 問題データModule
layout: code-preview
teachesConceptIds: [question-data-module]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 7, maxVisuals: 1 }
assets:
  - id: javascript-ch06-l01-module-flow
    source: assets/module-flow.svg
    mediaType: image
    alt: questions.jsでexportしたquestionsをmain.jsでimportし、問題数3を表示する流れ
    provenanceId: javascript-ch06-l01-module-flow-original
---

演習では`questions.js`の完成済みArrayへ`export`を1つ加えます。`main.js`のimportと表示処理は完成しています。

```js
// questions.js
export const questions = [
  { text: 'HTMLの役割は？' },
  { text: 'CSSの役割は？' },
  { text: 'JavaScriptの役割は？' },
];
```

![問題データをModule間で共有する流れ](asset:javascript-ch06-l01-module-flow)

Consoleへ`3`と表示されたら完成です。

:::practice
prompt: 変更するFileと追加するkeywordを答えます。
expectedAction: questions.jsへexportを加えると答える
estimatedMinutes: 1
:::
