---
id: next-ch04-l02-s02
title: useActionStateで返された状態を読む
kind: concept
concept: useActionStateで返された状態を読む
layout: comparison
teachesConceptIds: [next-action-state]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

useActionStateはstate、formAction、pendingを返します。formのactionへformActionを渡します。このhookと組み合わせたActionの引数(previous, formData)とは別です。previousは前回の戻り値で、初回はinitialStateです。今回の実multipart POSTはHTTP200でもinvalid・failed・savedを返すので、番号だけで保存成功と判断しません。

返信はstate.inputと現在のinputが一致するときだけ表示します。

```tsx
const [state, formAction, pending] = useActionState(saveNote, initialState);
// <form action={formAction}>
```

:::prediction
prompt: "HTTP200ならメモは必ず保存されていますか。"
answer: "いいえ。返されたstateのstatusも読みます。"
explanation: "ActionのHTTPと、入力検証や保存の結果は異なる情報です。"
:::
