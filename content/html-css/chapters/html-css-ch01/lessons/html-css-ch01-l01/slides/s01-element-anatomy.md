---
id: html-css-ch01-l01-s01
title: Elementは内容に意味を付ける箱
kind: diagram
concept: html-element
assets:
  - id: diagram-element-anatomy
    source: assets/element-anatomy.svg
    mediaType: image
    alt: 開始Tag、内容、終了TagからElementができる図
    provenanceId: ch01-element-anatomy-original
---

HTMLでは、文章をElementという箱に入れて役割を伝えます。開始Tag、内容、終了Tagの3つを合わせた全体がElementです。山かっこの中の名前は、Browserへ内容の種類を知らせます。

`p`を使うと、見た目ではなく「ここはひとまとまりの段落です」と伝えられます。開始Tagと終了Tagは同じ名前にし、終了Tag側にはslashを付けます。

![Elementを組み立てる3つの部分](asset:diagram-element-anatomy)

```html
<p>今日からHTMLを学びます。</p>
```

:::practice
prompt: 図とコード例で開始Tag、内容、終了Tagを左から順に指します。
expectedAction: 3部分を区別し、全体をElementと呼ぶことを説明する
estimatedMinutes: 2
:::

次は、ページの題名を表すh1と文章を表すpを使い分けます。
