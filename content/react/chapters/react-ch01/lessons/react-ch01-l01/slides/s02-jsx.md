---
id: react-ch01-l01-s02
title: JSXで値を表示する
kind: concept
concept: JSXで値を表示する
layout: comparison
teachesConceptIds: [react-jsx-role]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

JSXは、JavaScriptの中で表示を書く構文です。HTMLの文字列ではありません。TSXはJSXを書けるTypeScriptファイルで、拡張子は.tsxです。型を確認し、JavaScriptへ変換してからReactが実DOMを作ります。

```tsx
<h1>{question.prompt}</h1>
```

波括弧の中でJavaScriptの値を読みます。タグの外側へ引用符を付けると同じ意味にはなりません。今回の一覧は用意済みのmapで各文字列をliへ渡します。keyは表示する要素の目印で、詳しい練習は後の教材で行います。

:::practice
prompt: 問題文を渡す部分はタグ名ですか、波括弧の中の値ですか。
expectedAction: question.promptの値を波括弧で表示へ渡すと説明する
estimatedMinutes: 1
:::
