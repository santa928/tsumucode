---
id: javascript-ch00-l01-s04
title: 引用符の内側だけを変える
kind: concept
concept: 文字列の変更
layout: checkpoint
teachesConceptIds: [string-literal-edit]
masteryTarget: transform
screenBudget: { maxTextCharacters: 340, maxCodeLines: 2, maxVisuals: 0 }
assets: []
---

演習は完成した行から始めます。右端の引用符内だけを変え、実行して結果を比べます。

```js {"label":"script.js・変更例", "role":"input", "highlightedLines":[1]}
document.querySelector('#message').textContent = 'こんにちは';
```

```text {"label":"この変更例の表示", "role":"output"}
こんにちは
```

'#message'の引用符内は探す目印です。そこを変えると別の場所を探してしまいます。document、querySelector、textContentと記号は残します。HTMLの元の文字だけを直しても、JavaScriptが動くと上書きされます。

:::practice
prompt: 演習の指定文に合わせて右端の文字だけを直し、Previewで確認してから判定します。
expectedAction: 変更した文字と表示結果の一致を確認する
estimatedMinutes: 1
:::
