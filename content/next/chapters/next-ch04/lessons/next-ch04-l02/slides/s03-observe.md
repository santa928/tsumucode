---
id: next-ch04-l02-s03
title: pendingとcontrolled inputを組み合わせる
kind: concept
concept: pendingとcontrolled inputを組み合わせる
layout: comparison
teachesConceptIds: [next-action-pending]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

Actionのpending中は入力と送信の両方を無効にし、返信と現在の値がずれるのを防ぎます。通常のformでは完了後に非制御の入力がリセットされる場合があります。この演習はcontrolled inputを使い、失敗時にも値を保持します。

```tsx
<input name="note" value={input} disabled={pending} />
<button disabled={pending}>保存する</button>
```

:::prediction
prompt: "送信中に入力だけ編集できると、何が分かりにくくなりますか。"
answer: "返信がどのメモに対応するかです。"
explanation: "待機中は同じ入力を保護し、完了後に入力を変えたら古い結果を表示しません。"
:::
