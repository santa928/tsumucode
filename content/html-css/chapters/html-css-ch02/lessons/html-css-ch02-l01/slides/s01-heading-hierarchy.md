---
id: html-css-ch02-l01-s01
title: 見出しLevelで文書の階層を示す
kind: concept
concept: heading-hierarchy
assets: []
---

Headingは文章の区切りへ名前を付け、読者が全体像をつかむための骨組みを作ります。ページ全体の題名を`h1`、その中の大きな話題を`h2`で表します。

```html
<h1>わたしの学習記録</h1>
<section>
  <h2>学んだこと</h2>
</section>
<section>
  <h2>次に試すこと</h2>
</section>
```

`h1`の次に`h2`を使うのは文字を小さくしたいからではありません。「学んだこと」と「次に試すこと」が、どちらも「学習記録」に属する同じLevelの話題だからです。

:::practice
prompt: 「料理ノート」「材料」「作り方」をh1とh2へ分類します。
expectedAction: ページ題名をh1、2つの同格な話題をh2と説明する
estimatedMinutes: 2
:::

次は、各見出しの内容をParagraphとしてまとめます。
