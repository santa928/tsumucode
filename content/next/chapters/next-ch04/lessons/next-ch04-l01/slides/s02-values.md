---
id: next-ch04-l01-s02
title: 実POSTの状態を入力へ対応させる
kind: concept
concept: 実POSTの状態を入力へ対応させる
layout: comparison
teachesConceptIds: [next-form-response]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

このFormはJSONを実POSTします。検証エラーは400、一時失敗は503、保存は200です。返信の状態と送信した入力をstateへ保存します。別のメモを入力したら、以前の保存回数を現在の結果として表示しません。

```tsx
const visible = state.input === input ? state : initialState;
```

:::prediction
prompt: "保存後に別のメモへ入力を変えたら、前の保存回数はどうしますか。"
answer: "現在の結果から消します。"
explanation: "結果は送信した入力に対応し、別の入力を保存した証拠にはなりません。"
:::
