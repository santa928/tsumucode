---
id: next-ch04-l01-s01
title: ClientとServerで入力を検証する
kind: concept
concept: ClientとServerで入力を検証する
layout: comparison
teachesConceptIds: [next-form-validation]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

requiredやminLengthは入力欄の制約です。空白3文字はminLengthを通ります。Serverでも文字列をtrimし、3〜40文字かを検証してから保存します。Clientを通らない要求もServerの責務です。

```tsx
const input = typeof raw === 'string' ? raw.trim() : '';
if (input.length < 3 || input.length > 40) {
  // 保存せず、検証エラーを返す。
}
```

:::prediction
prompt: "空白3文字が送信できたら、有効なメモですか。"
answer: "いいえ。trim後は0文字なので、Serverで拒否します。"
explanation: "入力欄の制約とServerの検証は別の処理です。"
:::
