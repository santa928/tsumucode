---
id: 'next-ch03-l02-s03'
title: '対象なしは取得失敗と分ける'
kind: 'concept'
concept: '対象なしは取得失敗と分ける'
layout: 'comparison'
teachesConceptIds: ['next-not-found']
masteryTarget: 'transform'
screenBudget: { 'maxTextCharacters': 420, 'maxCodeLines': 12, 'maxVisuals': 0 }
assets: []
---

探した対象がないと分かったら、notFoundを呼び、その区間のnot-found.tsxを表示します。missingでは教材APIが404を返し、それを読んだpageがnotFoundを呼びます。

```tsx
import { notFound } from 'next/navigation';
if (response.status === 404) notFound();
```

ブラウザーへのpageは、逐次送信開始後ならHTTP200のまま対象なしを表示する場合があります。教材APIの404とは別の応答です。状態番号だけで成功と決めず、実際の表示も読みます。

:::prediction
prompt: "対象なしの案内と、取得に失敗したので再試行する案内は同じですか。"
answer: "別の状態です。"
explanation: "対象が存在しない場合と、取得自体が失敗した場合を分けます。"
:::
