---
id: 'next-ch03-l02-s02'
title: 'errorで案内し、再取得する'
kind: 'concept'
concept: 'errorで案内し、再取得する'
layout: 'comparison'
teachesConceptIds: ['next-retry']
masteryTarget: 'transform'
screenBudget: { 'maxTextCharacters': 420, 'maxCodeLines': 12, 'maxVisuals': 0 }
assets: []
---

データ取得に失敗したときはerror.tsxの案内を表示します。このファイルはClient Componentです。今回の固定Next版では、retryが再取得と再描画を行います。

```tsx
'use client';
export default function ErrorPage({ retry }: { retry: () => void }) {
  return <button onClick={retry}>再試行</button>;
}
```

resetは再取得を行わず、再描画だけを試みます。一度失敗する制御データで、再試行後の実取得と結果を確認します。

:::prediction
prompt: "データをもう一度取得する必要がある今回の失敗では、何を呼びますか。"
answer: "retryを呼びます。"
explanation: "今回のretryは実際の再取得も行います。resetとは区別します。"
:::
