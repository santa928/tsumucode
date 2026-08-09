---
id: javascript-ch02-l03-s02
title: else ifで次の条件を確かめる
kind: code
concept: else if
layout: code-preview
teachesConceptIds: [else-if-branch]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l03-else-if-flow
    source: assets/branch-flow.svg
    mediaType: image
    alt: 回答をA、B、その他へ上から順に分ける図
    provenanceId: javascript-ch02-l03-branch-flow-original
---

`else if (条件)`は、前の条件が`false`だったときに次の条件を確かめます。

```js
else if (
  answer === 'B'
) {
  console.log('Bです');
}
```

answerがBなら、2つ目の条件が`true`になります。

![else ifが次の条件を確かめる流れ](asset:javascript-ch02-l03-else-if-flow)

:::practice
prompt: 2つ目の条件を確かめるのはいつか答えます。
expectedAction: 最初の条件がfalseだったときと答える
estimatedMinutes: 1
:::
