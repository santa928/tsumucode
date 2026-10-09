---
id: next-ch05-l01-g01
title: 一覧と別々の詳細を結ぶ
kind: guide
layout: comparison
teachesConceptIds:
  - next-project-structure
masteryTarget: compose
screenBudget:
  maxTextCharacters: 420
  maxCodeLines: 12
  maxVisuals: 0
assets: []
---

一覧から2件の詳細へ移動し、paramsのidとデータを対応させます。固定の先頭データを返すと、URLを変えても同じ詳細です。各実URLの題名と屋外/室内を比べます。

```tsx
const { id } = await params;
const item = items.find((entry) => entry.id === id);
```

:::prediction
prompt: "詳細が常にitems[0]なら、seaのURLも海の案内ですか。"
answer: "いいえ。URLのidに対応する項目を選びます。"
explanation: "Briefの条件と実測した結果を対応させます。"
:::
