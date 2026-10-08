---
id: 'next-ch03-l01-s02'
title: 'no-storeとforce-cacheを比較する'
kind: 'concept'
concept: 'no-storeとforce-cacheを比較する'
layout: 'comparison'
teachesConceptIds: ['next-cache']
masteryTarget: 'transform'
screenBudget: { 'maxTextCharacters': 420, 'maxCodeLines': 12, 'maxVisuals': 0 }
assets: []
---

no-storeは取得結果をData Cacheへ保持しません。force-cacheは、同じ要求の保存済みの結果があれば再利用します。今回のpageは要求ごとに描画するため、page全体の静的化とは分けて比べられます。

```tsx
await fetch(url, { cache: 'no-store' });
await fetch(url, { cache: 'force-cache' });
```

freshでは取得番号が変わり、cachedでは番号が保たれるよう、pageのfresh/cached分岐のfetch設定を修正します。

:::prediction
prompt: "pageをもう一度描画しても、cachedの番号が同じなのはなぜですか。"
answer: "fetchが保持したデータを再利用するためです。"
explanation: "Serverでpageを描画することと、データを新しく取得することは別です。"
:::
