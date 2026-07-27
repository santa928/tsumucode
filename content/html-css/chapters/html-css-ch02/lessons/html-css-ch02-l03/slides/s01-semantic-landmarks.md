---
id: html-css-ch02-l03-s01
title: Semantic Elementは領域の役割を名前で伝える
kind: concept
concept: semantic-landmarks
layout: explanation
teachesConceptIds: [landmark-elements]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

HTMLには、内容の役割をTag名で表すSemantic Elementがあります。`header`、`main`、`footer`なら「導入」「中心内容」「末尾の補足」という違いを伝えられます。

`div`は意味を持たない汎用の箱です。役割が決まった領域をすべてdivにすると、文書の地図がBrowserへ伝わりません。

Landmarkは見た目を変えるためではなく、ページ内の移動と理解を助けます。実習ではclassを残し、divのTag名だけを役割名へ変えます。

:::practice
prompt: ページの中心記事をdivとmainのどちらで包むか判断します。
expectedAction: 中心内容という役割が明確なのでmainを選ぶ
estimatedMinutes: 2
:::

次は、header、main、footerをページの読み順に並べます。
