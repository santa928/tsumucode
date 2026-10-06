---
id: react-ch01-l01-s01
title: Componentは表示を返す関数
kind: concept
concept: Componentは表示を返す関数
layout: comparison
teachesConceptIds: [react-component-role]
masteryTarget: read
screenBudget: { maxTextCharacters: 420, maxCodeLines: 6, maxVisuals: 0 }
assets: []
---

Component（コンポーネント）は、表示のまとまりです。今回はQuestionCardという関数が、渡された問題の表示を返します。名前は大文字で始めます。

```tsx
function QuestionCard({ question }: { question: Question }) {
  return <h1>{question.prompt}</h1>;
}
```

関数の引数を分割代入で受け取り、問題文を表示しています。TSのQuestion型で値の形を確認します。この短い例は役割の説明で、演習では一覧を含む読み取り専用Componentを用意済みです。

:::practice
prompt: QuestionCardの引数と返すものは何ですか。
expectedAction: questionを受け取り、表示の内容を返すと説明する
estimatedMinutes: 1
:::
