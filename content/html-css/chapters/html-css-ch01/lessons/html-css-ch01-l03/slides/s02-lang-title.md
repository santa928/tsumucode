---
id: html-css-ch01-l03-s02
title: 文書の言語とTabの題名を設定する
kind: comparison
concept: document-language-and-title
assets: []
---

`html`の`lang`は文書全体の基本言語を伝えます。日本語のページなら`ja`を指定します。`head`内の`title`はページ本文には表示されず、Browser TabやBookmarkの名前として使われます。

さらに`meta charset="UTF-8"`は文字をどの規則で読むか伝えます。この3つは画面の本文ではなく文書全体を支えるMetadataです。見えない設定も、文字化けや読み上げ言語の誤りを防ぎます。

```html
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>HTML学習プロフィール</title>
  </head>
</html>
```

:::practice
prompt: コード例から本文に見える設定とBrowser Tabで使う設定を分けて探します。
expectedAction: langは言語、titleはTab名、charsetは文字の読み方を伝えると説明する
estimatedMinutes: 2
:::

次の演習では、3つのMetadataを自分で設定してChapter 01を仕上げます。
