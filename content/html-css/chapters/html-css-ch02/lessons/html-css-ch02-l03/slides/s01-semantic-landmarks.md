---
id: html-css-ch02-l03-s01
title: Semantic Elementは領域の役割を名前で伝える
kind: concept
concept: semantic-landmarks
assets: []
---

HTMLには、内容の役割をTag名で表すSemantic Elementがあります。`header`、`main`、`footer`を使うと、同じ箱でも「導入」「中心内容」「補足情報」という違いを伝えられます。

`div`は意味を持たない汎用の箱です。装飾やGroupingには役立ちますが、役割が決まっている領域をすべてdivにすると、文書の地図がBrowserへ伝わりません。

Landmarkを使う読者は、ページの先頭からすべてを聞かずにmainへ移動できます。Semantic Elementは見た目だけでなく、移動と理解を助けます。

:::practice
prompt: ページの中心記事をdivとmainのどちらで包むか判断します。
expectedAction: 中心内容という役割が明確なのでmainを選ぶ
estimatedMinutes: 2
:::

次は、header、main、footerをページの読み順に並べます。
