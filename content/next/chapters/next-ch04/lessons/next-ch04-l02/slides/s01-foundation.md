---
id: next-ch04-l02-s01
title: Server ActionへformDataを渡す
kind: concept
concept: Server ActionへformDataを渡す
layout: comparison
teachesConceptIds: [next-server-action]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

Server Actionは'use server'を持つServer側の非同期関数です。useActionStateと組み合わせるとpreviousは前回の戻り値（初回はinitialState）です。formDataの値を読み、文字列か、trim後に3〜40文字かを検証してから保存します。Clientから呼べても、処理はServerの責務です。

```tsx
'use server';
export async function saveNote(previous, formData) {
  const raw = formData.get('note');
  // 型と文字数を検証してから保存する。
}
```

:::prediction
prompt: "formDataの値が文字列かを確認するのはどこですか。"
answer: "Server Action側です。"
explanation: "入力欄だけに頼らず、実際に受け取った値をServerで検証します。"
:::
