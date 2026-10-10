---
id: next-ch05-l01-g02
title: GETは選択、POSTは保存
kind: guide
layout: comparison
teachesConceptIds:
  - next-project-filter
masteryTarget: compose
screenBudget:
  maxTextCharacters: 420
  maxCodeLines: 12
  maxVisuals: 0
assets: []
---

GET Formは選択値をURLのqueryへ載せます。searchParamsをawaitし、all/outdoor/indoorだけを使います。未知の値では一覧へ戻る案内を示します。これはメモのPOST保存とは別の操作です。

```tsx
const query = await searchParams;
const selected = typeof query.area === 'string' ? query.area : 'all';
const allowed = ['all', 'outdoor', 'indoor'].includes(selected);
```

:::prediction
prompt: "GETで屋外を選ぶと、Serverの保存回数が増えますか。"
answer: "いいえ。今回は表示の選択だけです。"
explanation: "Briefの条件と実測した結果を対応させます。"
:::
