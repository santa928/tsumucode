---
id: next-ch04-l01-s03
title: 入力を保ち、同じ内容で再試行する
kind: concept
concept: 入力を保ち、同じ内容で再試行する
layout: comparison
teachesConceptIds: [next-form-retry]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

練習用保存先は内容ごとの初回だけ一時失敗します。同じメモの再送で保存1回になります。controlled inputで失敗後の値を保ち、pending中は入力と送信を無効にします。保存先は永続DBではなく、Source反映・停止再開で初期化されます。

```tsx
<input value={input} disabled={pending} />
<button disabled={pending}>保存する</button>
```

:::prediction
prompt: "一時失敗したメモは、消して別の内容を入力しますか。"
answer: "同じ入力を保持して再試行します。"
explanation: "この練習では同じ内容の2回目で保存できるため、結果の順序を確かめられます。"
:::
