---
id: javascript-ch05-l02-s04
title: HTMLの問題だけを選び出す
kind: concept
concept: categoryによる問題のfilter
layout: code-preview
teachesConceptIds: [question-category-filter]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: javascript-ch05-l02-filter-flow
    source: assets/filter-flow.svg
    mediaType: image
    alt: HTML二問とCSS一問のArrayからfilterでHTML二問だけを残す流れ
    provenanceId: javascript-ch05-l02-filter-flow-original
---

演習では比較演算子だけを直し、HTML categoryの2問を選びます。

```js
const htmlQuestions = questions.filter((question) => {
  return question.category === 'HTML';
});

for (const question of htmlQuestions) {
  console.log(question.text);
}
```

![filterでHTMLの問題だけを残す流れ](asset:javascript-ch05-l02-filter-flow)

ConsoleへHTMLの2問だけが表示されれば完成です。

:::practice
prompt: 比較式へ使う演算子を答えます。
expectedAction: 厳密等価演算子===と答える
estimatedMinutes: 1
:::
