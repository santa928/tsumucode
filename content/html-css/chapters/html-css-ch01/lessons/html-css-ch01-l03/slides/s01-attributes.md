---
id: html-css-ch01-l03-s01
title: Attributeは開始Tagへ追加情報を書く
kind: code
concept: html-attribute
assets: []
---

Attributeは、Elementの種類だけでは足りない追加情報を開始Tagへ書く仕組みです。名前、equals、quoteで囲んだ値の順に書きます。内容を挟むTagとは役割が違い、終了Tagへ同じAttributeは書きません。

`lang="ja"`なら、langがAttribute名、jaが値です。Browserや読み上げはこの値を使い、文章をどの言語として扱うか判断できます。Attributeの順番やquoteの種類が違っても、名前と値が同じなら意味は同じです。

```html
<html lang="ja"></html>
```

:::practice
prompt: コード例でAttribute名、equals、値の3部分を順に指します。
expectedAction: langが名前、jaが値であり開始Tagへ書くと説明する
estimatedMinutes: 2
:::

次は、文書全体の言語とBrowser Tabの題名を設定します。
