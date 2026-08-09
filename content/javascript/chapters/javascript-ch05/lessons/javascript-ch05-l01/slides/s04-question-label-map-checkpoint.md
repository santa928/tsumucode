---
id: javascript-ch05-l01-s04
title: 問題文を表示用ラベルへ変換する
kind: concept
concept: 問題ラベルのmap変換
layout: code-preview
teachesConceptIds: [question-label-map]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: javascript-ch05-l01-map-flow
    source: assets/map-flow.svg
    mediaType: image
    alt: 3つの問題文がmapを通り、問題という接頭辞を持つ3つのラベルへ変わる流れ
    provenanceId: javascript-ch05-l01-map-flow-original
---

演習ではcallbackの`return`だけを直し、3つの問題文を表示用ラベルへ変換します。

```js
const labels = questions.map((question) => {
  return `問題: ${question}`;
});

for (const label of labels) {
  console.log(label);
}
```

![mapで3つの問題文を3つのラベルへ変える流れ](asset:javascript-ch05-l01-map-flow)

Consoleへ`問題: HTMLとは？`から3行が表示されれば完成です。

:::practice
prompt: returnする文字列を答えます。
expectedAction: '問題: と現在のquestionを組み合わせると答える'
estimatedMinutes: 1
:::
