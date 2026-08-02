---
id: javascript-ch00-l01-s04
title: 引用符の内側だけを変える
kind: concept
concept: 文字列の変更
layout: checkpoint
teachesConceptIds: [string-literal-edit]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

演習では`script.js`の1行が完成した状態から始めます。新しい書き方を覚えて追加する必要はありません。

```js
document.querySelector('#message').textContent = 'ここを書き換えます';
```

変更するのは、右端の引用符に囲まれた`ここを書き換えます`だけです。`document`、`querySelector`、`textContent`、記号はそのまま残します。

:::practice
prompt: 変更する範囲と、残す範囲を確認します。
expectedAction: 右端の引用符内だけを変更し、それ以外は残すと答える
estimatedMinutes: 1
:::
