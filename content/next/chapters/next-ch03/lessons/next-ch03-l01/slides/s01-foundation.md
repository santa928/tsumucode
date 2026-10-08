---
id: 'next-ch03-l01-s01'
title: 'Serverで取得して表示する'
kind: 'concept'
concept: 'Serverで取得して表示する'
layout: 'comparison'
teachesConceptIds: ['next-data-fetch']
masteryTarget: 'transform'
screenBudget: { 'maxTextCharacters': 420, 'maxCodeLines': 12, 'maxVisuals': 0 }
assets: []
---

Server Componentでは、fetchの応答を待ってから値を表示できます。ここでは教材内の制御データを使います。取得されるたびに番号と値が変わるので、「同じ表示」を「再取得した」と決めつけません。

```tsx
const response = await fetch(url, { cache: 'no-store' });
if (!response.ok) throw new Error('取得に失敗しました');
const data = await response.json();
```

connectionは要求を待ってpageを描くために使います。外部APIの契約や秘密鍵は不要です。保存して反映した後、「毎回取得」→「取得と保持の入口」→「毎回取得」と選び、番号を比べます。

:::prediction
prompt: "番号が1→2へ変わったとき、何が起きたと判断できますか。"
answer: "制御データへ新しい取得が行われました。"
explanation: "このデータの番号は実際に取得されるたびに増えます。"
:::
