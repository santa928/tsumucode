---
id: javascript-ch03-l01-s04
title: 用意されたFunctionを1回呼び出す
kind: concept
concept: 問題を表示するFunction
layout: code-preview
teachesConceptIds: [show-question-function]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: javascript-ch03-l01-call-flow
    source: assets/function-call-flow.svg
    mediaType: image
    alt: Function宣言からshowQuestionの呼び出しを経て問題文が表示される流れ
    provenanceId: javascript-ch03-l01-function-call-flow-original
---

演習では、完成済みのFunction宣言は変更しません。末尾へ`showQuestion();`を1行加え、問題文を1回だけ表示します。

```js
function showQuestion() {
  console.log('問題1: 2 + 3 は？');
}

showQuestion();
```

![Functionを呼び出して表示する流れ](asset:javascript-ch03-l01-call-flow)

:::practice
prompt: 追加する1行とConsoleの結果を確認します。
expectedAction: showQuestionを呼び出すと問題文が1回表示されると答える
estimatedMinutes: 1
:::
