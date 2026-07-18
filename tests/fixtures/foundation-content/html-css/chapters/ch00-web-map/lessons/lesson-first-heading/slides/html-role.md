---
id: slide-html-role
title: HTMLは内容の役割を伝える
kind: concept
concept: HTMLの要素
assets:
  - id: html-structure
    source: assets/html-structure.svg
    mediaType: image
    alt: HTML要素が開始Tag、内容、終了Tagから組み上がる図
    provenanceId: html-structure-original
---

## HTMLは内容の役割を伝える

Webページには、題名、文章、画像など、役割の違う内容が並びます。HTMLはTagで内容を囲み、その内容が何なのかをブラウザへ伝えます。

![HTML要素の3つの部品](asset:html-structure)

### 要素は3つの部品でできている

- 開始Tagは役割の始まりを示す
- 内容は画面に伝えたい言葉を持つ
- 終了Tagは役割の終わりを示す

```html
<h1>はじめてのWebページ</h1>
```

:::callout
tone: tip
title: h1はページを代表する見出し
text: h1は文字を大きくするためだけでなく、ページで最も大切な見出しだと伝える要素です。
:::

:::practice
prompt: 上のcodeから、見出しとして表示される内容を探します。
expectedAction: 開始Tagと終了Tagの間にある言葉を確認する
estimatedMinutes: 2
:::
