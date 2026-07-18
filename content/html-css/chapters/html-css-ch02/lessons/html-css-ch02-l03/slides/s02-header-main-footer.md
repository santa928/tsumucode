---
id: html-css-ch02-l03-s02
title: header、main、footerでページの大枠を作る
kind: code
concept: page-landmark-order
assets: []
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

通常、ページ内のmainは1つです。headerやfooterはmainの中にも置けますが、まずはページ全体を表す3領域の兄弟関係から覚えます。

:::practice
prompt: 導入、中心内容、末尾の補足を3つのTagへ対応させます。
expectedAction: header、main、footerの順と役割を説明する
estimatedMinutes: 2
:::

次は、mainの中を話題ごとのsectionへ分けます。
