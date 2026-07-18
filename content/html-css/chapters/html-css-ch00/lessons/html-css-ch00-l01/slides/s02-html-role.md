---
id: html-css-ch00-l01-s02
title: HTMLは内容と意味を積み上げる
kind: code
concept: html-content-and-meaning
assets: []
---

HTMLは、ページに載せる言葉を用意し、その言葉が題名なのか段落なのかをBrowserへ伝えます。山かっこで囲まれた目印をTagと呼び、内容をTagで挟んだまとまりをElementと呼びます。

次の例では、同じ文字でも`h1`はページ全体の題名、`p`はひとまとまりの文章だと伝えます。文字を大きくしたいから`h1`を選ぶのではなく、内容の役割に合わせて選ぶことが大切です。

```html
<h1>わたしのプロフィール</h1>
<p>Webページ作りを学んでいます。</p>
```

:::practice
prompt: コード例の題名と文章を指し、どちらがh1でどちらがpか予測してからPreviewの見え方を確認します。
expectedAction: h1とpが文字の見た目ではなく内容の役割を伝えると説明する
estimatedMinutes: 2
:::

次は、HTMLで用意した内容の色や余白をCSSで変える方法を見ます。
