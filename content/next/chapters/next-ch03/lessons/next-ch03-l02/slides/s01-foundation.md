---
id: 'next-ch03-l02-s01'
title: 'loadingは待機中の表示'
kind: 'concept'
concept: 'loadingは待機中の表示'
layout: 'comparison'
teachesConceptIds: ['next-loading']
masteryTarget: 'transform'
screenBudget: { 'maxTextCharacters': 420, 'maxCodeLines': 12, 'maxVisuals': 0 }
assets: []
---

loading.tsxは、その区間のpageが応答を待つ間の表示を用意します。今回は遅いデータが1.5秒後に届く固定ページへ、NextのLinkで移動します。Linkは応答を取り込み、文書全体の再読込と違う方法で画面を切り替えます。prefetchをfalseにして、移動前の取得を使わずに観察します。

```tsx
export default function Loading() {
  return <p role="status">応答を待っています</p>;
}
```

表示文だけでなく、「待機表示→結果」の順番を確かめます。

:::prediction
prompt: "待機表示が見えた後、データが届いたら何が表示されますか。"
answer: "そのpageの結果へ切り替わります。"
explanation: "loadingは失敗の結果ではなく、待っている間の表示です。"
:::
