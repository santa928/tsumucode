---
id: react-ch01-l01-s03
title: Propsでデータを渡す
kind: concept
concept: Propsでデータを渡す
layout: comparison
teachesConceptIds: [react-props-data]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

Props（プロップス）は呼び出し元からComponentへ渡す値です。左のquestionは受け取る名前、右のquestionはTSで用意したオブジェクトです。

```tsx
<QuestionCard question={question} />
```

Question型ではpromptはstring、choicesはreadonly string[]、correctIndexはnumberです。promptへ42を渡すと型が合いません。数値を文字列に直すだけでなく、指定の問題文を渡しましょう。Propsの型が通っても、意図した表示になるかは実画面で別に確かめます。

:::practice
prompt: promptを42から文字列へ直したら、正しい問題文になったことも保証されますか。
expectedAction: 型の一致と表示内容の正しさは別に確認すると説明する
estimatedMinutes: 1
:::
