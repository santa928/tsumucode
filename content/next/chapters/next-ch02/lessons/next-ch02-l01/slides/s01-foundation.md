---
id: next-ch02-l01-s01
title: フォルダーとURLを対応させる
kind: concept
concept: フォルダーとURLを対応させる
layout: comparison
teachesConceptIds: [next-layout]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

ReactではComponentを組み合わせました。NextのApp Routerはapp内のフォルダーとpage.tsxをURLへ対応させます。layout.tsxのchildrenに、その場所のpageや内側のlayoutが入ります。

```text
app/layout.tsx             全pageを囲む
app/page.tsx               /
app/trips/layout.tsx       /trips配下を囲む
app/trips/page.tsx         /trips
app/trips/[slug]/page.tsx  /trips/forest など
```

演習のPreviewにはrunごとのURL接頭辞があります。ここでは、その後ろのアプリ内URLを表します。tripsの見出しは一覧と詳細に共通で、入口のpageには入りません。

:::prediction
prompt: "旅行一覧と森の詳細の両方に、trips/layout.tsxの見出しは出ますか。"
answer: "一覧と森の詳細には出て、入口には出ません。"
explanation: "trips配下のpageだけがtrips/layout.tsxに囲まれます。"
:::
