---
id: html-css-ch02-l03-s03
title: sectionとarticleは内容の独立性で選ぶ
kind: comparison
concept: section-and-article
assets: []
---

`section`は、見出しを持つ話題のまとまりを表します。mainの中に「今日の学び」と「次の目標」があるなら、それぞれをsectionに分けられます。

`article`は、ニュース記事や投稿のように、その部分だけを取り出しても独立して読める内容に向いています。単に枠線を付けたい箱へarticleを使うわけではありません。

- ページ内の話題を分けるならsection
- 単独で配信・再利用できる内容ならarticle
- 意味がなく装飾用のGroupingならdiv

:::practice
prompt: 学習記録ページ内の「次の目標」をsectionとarticleのどちらで表すか考えます。
expectedAction: ページ内の1話題なのでsectionを選び、独立記事との違いを述べる
estimatedMinutes: 2
:::

次の実習ではheader、main、footerに加え、main直下へsectionを置きます。
