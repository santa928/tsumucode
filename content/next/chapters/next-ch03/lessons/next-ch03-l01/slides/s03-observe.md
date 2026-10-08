---
id: 'next-ch03-l01-s03'
title: '期限後の再検証を観察する'
kind: 'concept'
concept: '期限後の再検証を観察する'
layout: 'comparison'
teachesConceptIds: ['next-revalidate']
masteryTarget: 'transform'
screenBudget: { 'maxTextCharacters': 420, 'maxCodeLines': 12, 'maxVisuals': 0 }
assets: []
---

next.revalidateはデータの保持時間を秒で指定します。教材では1秒を使い、期限内と期限後の複数の応答を比較します。

```tsx
await fetch(url, { next: { revalidate: 1 } });
```

期限を過ぎた最初の要求でも、以前の値が返ることがあります。裏で再取得が終わると、その後の要求で値が更新されます。「1秒後の最初の応答で必ず新しい値」とは予測しません。

:::prediction
prompt: "期限後の最初の番号が同じなら、直ちに失敗と判断しますか。"
answer: "いいえ。その後の要求で更新されたかも確認します。"
explanation: "期限後の再検証では以前の値を返しながら更新する場合があります。"
:::
