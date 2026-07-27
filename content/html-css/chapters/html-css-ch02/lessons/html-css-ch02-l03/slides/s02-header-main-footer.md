---
id: html-css-ch02-l03-s02
title: header、main、footerでページの大枠を作る
kind: code
concept: page-landmark-order
layout: code-preview
teachesConceptIds: [header-main-footer]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: preview-page-landmarks
    source: assets/landmark-map-preview.svg
    mediaType: image
    alt: header、main、footerが上から順に並ぶページの地図
    provenanceId: ch02-landmark-map-original
---

ページの大枠は、導入を`header`、そのページ固有の中心内容を`main`、末尾の補足を`footer`として順に置けます。

```html
<header>
  <h1>学習記録</h1>
</header>
<main>
  <p>今日学んだ内容です。</p>
</main>
<footer>
  <p>次回の予定を確認します。</p>
</footer>
```

![header、main、footerのページ地図](asset:preview-page-landmarks)

まずはbody直下へ3領域をこの順で1つずつ置きます。実習ではpage-header、page-main、page-footerのclassを残し、対応するdivの開始Tagと終了Tagを変更します。

:::practice
prompt: 導入、中心内容、末尾の補足を3つのTagへ対応させます。
expectedAction: header、main、footerの順と役割を説明する
estimatedMinutes: 2
:::

次は、mainの中を話題ごとのsectionへ分けます。
