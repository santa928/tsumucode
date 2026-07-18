---
id: html-css-ch03-l01-s02
title: 行き先に合わせてFragmentとhttpsを選ぶ
kind: comparison
concept: safe-link-destinations
assets: []
---

同じページの中へ移動するなら`#section-id`、外部のWebページへ移動するならHTTPS SchemeのURLを使います。

TsumuCodeのPreviewは学習者を守るため、`javascript:`のようにCodeを実行するURLや未許可Schemeを除去します。Form送信や新しいWindowを使わなくても、Linkの構造と意味は学べます。

```html
<a href="#profile">プロフィールへ移動</a> <a href="HTTPSの練習用URL">練習用Siteを見る</a>
```

:::practice
prompt: ページ内のProfileと外部の練習用Siteに、どちらのhref形式を使うか選びます。
expectedAction: ProfileはFragment、外部Siteはhttpsと分類する
estimatedMinutes: 2
:::

次の実習では、2種類のLinkと説明的なLink Textを組み立てます。
