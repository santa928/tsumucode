---
id: javascript-ch03-l04-s04
title: 回答へ見出しを付けて返す
kind: concept
concept: 回答を整形するArrow Function
layout: code-preview
teachesConceptIds: [answer-format-function]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: javascript-ch03-l04-arrow-flow
    source: assets/arrow-return-flow.svg
    mediaType: image
    alt: 'BをArrow Functionへ渡し、回答: Bを返す流れ'
    provenanceId: javascript-ch03-l04-arrow-return-flow-original
---

演習では、`return answer;`だけを、`'回答: '`と`answer`をつなぐ式へ変更します。Arrow Functionの形と呼び出しは残します。

```js
const formatAnswer = (answer) => {
  return '回答: ' + answer;
};

console.log(formatAnswer('B'));
```

![Bを回答: Bへ整形する流れ](asset:javascript-ch03-l04-arrow-flow)

:::practice
prompt: 変更する行と結果を確認します。
expectedAction: 'returnの行を変更すると回答: Bが表示されると答える'
estimatedMinutes: 1
:::
